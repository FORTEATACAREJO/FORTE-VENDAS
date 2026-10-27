"""FORTE Connect: read-only folder capture, durable queue and outbound HTTPS only.
Python 3.11+ standard library. No Connect login, database write, fiscal or financial API.
"""
import argparse, base64, csv, ctypes, hashlib, io, json, logging, os, re, sqlite3, sys, time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from urllib.parse import urlparse

ROOT = Path(os.environ.get('LOCALAPPDATA', Path.home() / '.local/share')) / 'ForteConnect'
ENDPOINTS = {'FISCAL_XML': 'https://xmfpvvmvdkepmnvtdoio.supabase.co/functions/v1/connect-mirror', 'VENDAS': 'https://gtwecfyffjszghnvtlzr.supabase.co/functions/v1/connect-mirror'}
MAX_FILE = 10_000_000

def protect(value, decrypt=False):
    if os.name != 'nt':
        # Non-Windows is for local tests. Do not persist device secrets there.
        raise ValueError('O cadastro do dispositivo exige Windows e proteção DPAPI.')
    class Blob(ctypes.Structure):
        _fields_ = [('length', ctypes.c_ulong), ('data', ctypes.POINTER(ctypes.c_char))]
    raw = base64.b64decode(value) if decrypt else value.encode()
    buffer = ctypes.create_string_buffer(raw)
    source = Blob(len(raw), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))
    output = Blob()
    fn = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    ok = fn(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output))
    if not ok: raise ValueError('Não foi possível acessar a proteção de credencial do Windows.')
    try:
        data = ctypes.string_at(output.data, output.length)
        return data.decode() if decrypt else base64.b64encode(data).decode()
    finally: ctypes.windll.kernel32.LocalFree(output.data)

def validate_config(c):
    if c.get('version') != 1 or c.get('mode') not in ENDPOINTS or c.get('endpoint') != ENDPOINTS[c['mode']]:
        raise ValueError('Configuração de destino desconhecida. Gere pelo sistema Forte.')
    if not re.fullmatch(r'[0-9a-f-]{36}', c.get('device_id','')): raise ValueError('Dispositivo inválido.')
    if not c.get('folders'): raise ValueError('Selecione ao menos uma pasta de exportação.')
    for folder in c['folders']:
        if not Path(folder).is_dir(): raise ValueError('Pasta configurada não disponível.')
    return c

def stamp(value, settings):
    value = value.strip()
    if settings.get('datetime_format'):
        dt = datetime.strptime(value, settings['datetime_format'])
        offset = settings.get('timezone_offset', '-03:00')
        if not re.fullmatch(r'[+-]\d{2}:\d{2}', offset): raise ValueError('Fuso inválido.')
        sign = 1 if offset[0]=='+' else -1
        dt = dt.replace(tzinfo=timezone(sign*timedelta(hours=int(offset[1:3]),minutes=int(offset[4:6]))))
    else: dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if dt.tzinfo is None: raise ValueError('Data sem fuso. Configure datetime_format e timezone_offset ou exporte ISO com fuso.')
    return dt.isoformat(timespec='seconds')

def number(value, settings, positive=False):
    value = value.strip()
    if settings.get('decimal', ',') == ',':
        if not re.fullmatch(r'(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?', value): raise ValueError('Número inválido no CSV.')
        value = value.replace('.', '').replace(',', '.')
    elif not re.fullmatch(r'\d+(?:\.\d+)?', value): raise ValueError('Número inválido no CSV.')
    if len(value) > 24 or not Decimal(value).is_finite() or (positive and Decimal(value)<=0): raise ValueError('Quantidade/valor inválido.')
    return format(Decimal(value), 'f')

def sales_records(raw, settings):
    """Complete sale snapshots; never treats a missing row/file as cancellation."""
    source = settings.get('source_system', 'CONNECT')
    columns = settings['columns']
    required = ['sourceCompany','saleId','updatedAt','date','status','customer','total','line','code','description','unit','quantity','unitPrice','itemTotal']
    if any(k not in columns for k in required): raise ValueError('Mapeamento de colunas incompleto.')
    reader = csv.DictReader(io.StringIO(raw.decode(settings.get('encoding','utf-8-sig'))), delimiter=settings.get('delimiter',';'))
    if not reader.fieldnames or any(columns[k] not in reader.fieldnames for k in required): raise ValueError('Cabeçalho diferente do mapeamento configurado.')
    if len(set(reader.fieldnames))!=len(reader.fieldnames): raise ValueError('Colunas repetidas no arquivo.')
    groups = {}
    for index, row in enumerate(reader,2):
        if index > 50001: raise ValueError('Divida a exportação em arquivos menores.')
        if None in row: raise ValueError('Linha com colunas em excesso.')
        def value(k):
            v = row.get(columns[k])
            if v is None or not v.strip(): raise ValueError('Campo vazio na linha '+str(index)+': '+k)
            return v.strip()
        company, sale = value('sourceCompany'), value('saleId')
        status = settings.get('statuses',{}).get(value('status'))
        if status not in ['ABERTA','CONCLUIDA','CANCELADA','DEVOLVIDA']: raise ValueError('Situação não mapeada na linha '+str(index))
        head = dict(sourceSystem=source,sourceCompany=company,saleId=sale,updatedAt=stamp(value('updatedAt'),settings),date=stamp(value('date'),settings),status=status,customer=value('customer'),total=number(value('total'),settings))
        key = (company,sale)
        entry = groups.setdefault(key, dict(head=head,items={}))
        if entry['head']!=head: raise ValueError('Dados divergentes entre itens da mesma venda. Exporte uma versão completa de cada venda.')
        line=value('line')
        item=dict(line=line,code=value('code'),description=value('description'),unit=value('unit'),quantity=number(value('quantity'),settings,True),unitPrice=number(value('unitPrice'),settings),total=number(value('itemTotal'),settings))
        if line in entry['items']: raise ValueError('Item repetido na mesma venda.')
        entry['items'][line]=item
    return [dict(action='INGEST',sale=dict(e['head'],items=[e['items'][k] for k in sorted(e['items'])])) for _,e in sorted(groups.items())]

class Queue:
    def __init__(self, path):
        self.db=sqlite3.connect(path)
        self.db.execute('pragma journal_mode=WAL')
        self.db.executescript('''create table if not exists files(path text primary key,hash text not null);
        create table if not exists queue(hash text primary key,body text not null,status text not null default 'PENDING',attempts integer not null default 0,next_at real not null default 0,last_code text,created_at real not null);
        ''')
    def seen(self, path, digest): return self.db.execute('select 1 from files where path=? and hash=?',(path,digest)).fetchone() is not None
    def stage(self, path, digest, records):
        with self.db:
            for record in records:
                body=json.dumps(record,ensure_ascii=False,sort_keys=True,separators=(',',':'))
                h=hashlib.sha256(body.encode()).hexdigest()
                self.db.execute('insert or ignore into queue(hash,body,created_at) values(?,?,?)',(h,body,time.time()))
            self.db.execute('insert into files(path,hash) values(?,?) on conflict(path) do update set hash=excluded.hash',(path,digest))
    def pending(self): return self.db.execute("select hash,body,attempts from queue where status='PENDING' and next_at<=? order by created_at limit 30",(time.time(),)).fetchall()
    def ack(self,h):
        with self.db: self.db.execute("update queue set status='SENT',body='',last_code='200' where hash=?",(h,))
    def retry(self,h,attempts,code):
        with self.db: self.db.execute('update queue set attempts=?,next_at=?,last_code=? where hash=?',(attempts+1,time.time()+min(3600,30*2**min(attempts,7)),str(code),h))
    def counts(self): return dict(self.db.execute('select status,count(*) from queue group by status').fetchall())

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

def send(config, token, body):
    request=Request(config['endpoint'],data=body.encode(),method='POST',headers={'Content-Type':'application/json','x-connect-device':config['device_id'],'x-connect-token':token})
    with build_opener(NoRedirect()).open(request,timeout=40) as response:
        out=json.loads(response.read(4096))
        if response.status!=200 or out.get('ok') is not True or out.get('mirrorOnly') is not True: raise ValueError('ACK_INVALIDO')

def scan(config, queue):
    ext='.xml' if config['mode']=='FISCAL_XML' else '.csv'
    errors=[]
    for folder in config['folders']:
        root=Path(folder)
        if not root.is_dir(): errors.append('Pasta indisponível.'); continue
        for file in root.rglob('*'):
            if file.is_symlink() or file.suffix.lower()!=ext or not file.is_file(): continue
            try:
                before=file.stat()
                if time.time()-before.st_mtime<5: continue
                if before.st_size>MAX_FILE: raise ValueError('Arquivo acima de 10 MB.')
                raw=file.read_bytes()
                after=file.stat()
                if (before.st_size,before.st_mtime_ns)!=(after.st_size,after.st_mtime_ns): continue
                digest=hashlib.sha256(raw).hexdigest()
                if queue.seen(str(file),digest): continue
                if config['mode']=='FISCAL_XML':
                    if len(raw)>350000: raise ValueError('XML acima de 350 KB.')
                    xml=raw.decode('utf-16' if raw[:2] in [b'\xff\xfe',b'\xfe\xff'] else 'utf-8-sig')
                    if re.search(r'<!DOCTYPE|<!ENTITY',xml,re.I): raise ValueError('DTD/entidades não permitidos.')
                    records=[dict(action='INGEST',xml=xml)]
                else: records=sales_records(raw,config['sales'])
                queue.stage(str(file),digest,records)
            except (ValueError,OSError,UnicodeError,KeyError,csv.Error) as error:
                errors.append(file.name+': '+str(error))
    return errors

def run(config_file, watch=False):
    config=validate_config(json.loads(Path(config_file).read_text(encoding='utf-8')))
    token=protect(config['token_dpapi'],True)
    ROOT.mkdir(parents=True,exist_ok=True)
    queue=Queue(ROOT/(config['device_id']+'.sqlite3'))
    while True:
        errors=scan(config,queue)
        for error in errors: logging.warning('Leitura pendente: %s',error)
        for h,body,attempts in queue.pending():
            try: send(config,token,body);queue.ack(h)
            except HTTPError as error:
                queue.retry(h,attempts,error.code)
                logging.warning('Envio pendente: HTTP %s',error.code)
                if error.code in [401,403,429]: break
            except Exception:
                queue.retry(h,attempts,'REDE_OU_CONFIRMACAO')
                logging.warning('Envio sem confirmação; preservado na fila.')
                break
        logging.info('Fila: %s; pendências de leitura: %s',queue.counts(),len(errors))
        if not watch: return queue.counts(),errors
        time.sleep(max(30,int(config.get('interval_seconds',60))))

def setup():
    import tkinter as tk
    from tkinter import filedialog,messagebox
    root=tk.Tk();root.withdraw()
    try:
        source=filedialog.askopenfilename(title='Selecione a configuração gerada pelo Master no Forte',filetypes=[('Configuração JSON','*.json')])
        if not source: return
        config=json.loads(Path(source).read_text(encoding='utf-8-sig'))
        folder=filedialog.askdirectory(title='Selecione APENAS a pasta de XMLs ou exportações CSV do Connect')
        if not folder:return
        config['folders']=[folder];validate_config(config)
        token=config.pop('token','')
        if not re.fullmatch(r'cmt_[0-9a-f]{64}',token):raise ValueError('Credencial inválida.')
        config['token_dpapi']=protect(token)
        ROOT.mkdir(parents=True,exist_ok=True)
        target=ROOT/(config['mode'].lower()+'.json')
        temporary=target.with_suffix('.tmp');temporary.write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(temporary,target)
        messagebox.showinfo('FORTE Connect',f'Configurado em {target}\nO segredo foi protegido pelo Windows. Guarde a configuração original em local seguro.\nUse INICIAR para enviar as cópias. Para vendas, confira o mapeamento das colunas antes.')
    except Exception as error:messagebox.showerror('Configuração pendente',str(error))
    finally: root.destroy()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--setup',action='store_true');parser.add_argument('--config');parser.add_argument('--watch',action='store_true');parser.add_argument('--mode',choices=['fiscal_xml','vendas'])
    args=parser.parse_args()
    ROOT.mkdir(parents=True,exist_ok=True)
    logging.basicConfig(filename=ROOT/'agente.log',level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s',encoding='utf-8')
    if args.setup:setup()
    else:
        try:run(args.config or ROOT/((args.mode or 'fiscal_xml')+'.json'),args.watch)
        except Exception as error:
            logging.error('Agente parado: %s',type(error).__name__)
            print('Configuração indisponível. Execute CONFIGURAR e confira as pastas.');sys.exit(1)
