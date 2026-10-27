from pathlib import Path
import shutil, json, hashlib, zipfile, textwrap
ROOT=Path(__file__).resolve().parent
AGENT=ROOT.parent/'connect-agent/agent'
DOWNLOADS=ROOT/'downloads'
DOWNLOADS.mkdir(parents=True,exist_ok=True)
(ROOT/'output').mkdir(parents=True,exist_ok=True)
expected={'python-3.11.9-amd64.exe':'e8dcd502e34932eebcaf1be056d5cbcd','python-3.11.9.exe':'2a1d1ac2d8a0aa847515f9dd121ccbb7'}
for name,md5 in expected.items():
 data=(DOWNLOADS/name).read_bytes()
 assert hashlib.md5(data).hexdigest()==md5, name
 assert data[:2]==b'MZ',name
hashes={name:hashlib.sha256((DOWNLOADS/name).read_bytes()).hexdigest() for name in expected}
INSTALL=r'''#requires -Version 5.1
$ErrorActionPreference='Stop'
$PackageRoot=Split-Path $PSScriptRoot -Parent
$Preset=Get-Content -LiteralPath (Join-Path $PackageRoot 'perfil-do-desktop.json') -Raw | ConvertFrom-Json
$Base=Join-Path $env:LOCALAPPDATA 'ForteConnect'
$App=Join-Path $Base $Preset.installFolder
$Runtime=Join-Path $Base 'Python311'
$Logs=Join-Path $Base 'Instalacao'
New-Item -ItemType Directory -Force -Path $Base,$Logs | Out-Null
Write-Host ''
Write-Host $Preset.title -ForegroundColor Cyan
Write-Host 'PREPARACAO DO COMPUTADOR - ainda nao conecta nem envia dados.'
Write-Host ''
function Find-Python {
 $Candidates=@((Join-Path $Runtime 'python.exe'),(Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'))
 foreach($Launcher in @('py.exe','python.exe')) {
  $Command=Get-Command $Launcher -ErrorAction SilentlyContinue
  if($Command -and $Command.Source -notmatch '\\WindowsApps\\') {
   try {
    if($Launcher -eq 'py.exe') { $Found=& $Command.Source -3 -c 'import sys; print(sys.executable)' 2>$null }
    else { $Found=& $Command.Source -c 'import sys; print(sys.executable)' 2>$null }
    if($LASTEXITCODE -eq 0 -and $Found) { $Candidates+=@($Found) }
   } catch { }
  }
 }
 foreach($Candidate in ($Candidates | Select-Object -Unique)) {
  if(!$Candidate -or !(Test-Path -LiteralPath $Candidate -PathType Leaf)) { continue }
  try { & $Candidate -c 'import sys,tkinter,sqlite3,ssl,ctypes; assert sys.version_info >= (3,11)' 2>$null; if($LASTEXITCODE -eq 0){return $Candidate} } catch { }
 }
 return $null
}
try {
 if($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { throw 'Este pacote foi preparado para Windows Intel/AMD de 32 ou 64 bits.' }
 $Python=Find-Python
 if(!$Python) {
  $InstallerName=if([Environment]::Is64BitOperatingSystem){'python-3.11.9-amd64.exe'}else{'python-3.11.9.exe'}
  $Installer=Join-Path $PackageRoot ('Python\'+$InstallerName)
  $Checks=Get-Content -LiteralPath (Join-Path $PackageRoot 'Python\verificacao.json') -Raw | ConvertFrom-Json
  $ExpectedHash=$Checks.PSObject.Properties[$InstallerName].Value
  if((Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedHash) { throw 'O instalador do Python esta incompleto ou diferente do arquivo verificado. Baixe o ZIP novamente.' }
  $Signature=Get-AuthenticodeSignature -LiteralPath $Installer
  if($Signature.Status -ne 'Valid' -or $Signature.SignerCertificate.Subject -notmatch 'Python Software Foundation') { throw 'Nao foi possivel validar a assinatura oficial do instalador Python. Confira data/hora e conexao do Windows; nao execute um arquivo sem assinatura valida.' }
  Write-Host 'Instalando o Python incluido no pacote. Aguarde a conclusao.'
  $Log=Join-Path $Logs ('python-'+$Preset.mode+'.log')
  $Arguments=@('/passive','/norestart','InstallAllUsers=0','Include_launcher=0','InstallLauncherAllUsers=0','Include_pip=0','Include_test=0','Include_doc=0','Include_tcltk=1','Include_dev=0','Include_debug=0','Include_symbols=0','AssociateFiles=0','Shortcuts=0','PrependPath=0',('TargetDir="'+$Runtime+'"'),'/log',('"'+$Log+'"'))
  $Process=Start-Process -FilePath $Installer -ArgumentList $Arguments -Wait -PassThru
  if($Process.ExitCode -notin @(0,3010)) { throw ('O instalador nao concluiu. Codigo '+$Process.ExitCode+'. O registro esta em '+$Log) }
  $Python=Find-Python
  if(!$Python) { throw 'Python ainda indisponivel. Reinicie o Windows se solicitado e execute este instalador novamente.' }
 }
 Write-Host 'Python pronto. Copiando o agente deste desktop.'
 New-Item -ItemType Directory -Force -Path $App | Out-Null
 foreach($File in @('connect_agent.py','configurar_desktop.py','perfil-do-desktop.json','LEIA_PRIMEIRO.txt')) {
  Copy-Item -LiteralPath (Join-Path $PackageRoot $File) -Destination (Join-Path $App $File) -Force
 }
 Copy-Item -LiteralPath (Join-Path $PackageRoot 'rotinas') -Destination $App -Recurse -Force
 $Info=@{python=$Python;mode=$Preset.mode;installedAt=(Get-Date).ToString('o');title=$Preset.title}
 $Info | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $App 'instalacao.json') -Encoding UTF8
 $Desktop=[Environment]::GetFolderPath('Desktop')
 $Shell=New-Object -ComObject WScript.Shell
 foreach($Action in @(@('Configurar','configurar.ps1'),@('Iniciar','iniciar.ps1'))) {
  $Shortcut=$Shell.CreateShortcut((Join-Path $Desktop ($Preset.shortcut+' - '+$Action[0]+'.lnk')))
  $Shortcut.TargetPath=Join-Path $PSHOME 'powershell.exe'
  $Shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $App ('rotinas\'+$Action[1]))+'"'
  $Shortcut.WorkingDirectory=$App
  $Shortcut.Description=$Preset.title+' - '+$Action[0]
  $Shortcut.Save()
 }
 Write-Host ''
 Write-Host 'PREPARACAO CONCLUIDA.' -ForegroundColor Green
 Write-Host ('Atalhos criados: '+$Preset.shortcut+' - Configurar / Iniciar')
 Write-Host 'Nenhuma pasta do Connect foi lida e nenhum envio foi iniciado.'
 Write-Host 'As ligacoes serao feitas depois pelo atalho Configurar.'
 Write-Host ('Agente instalado em: '+$App)
} catch {
 Write-Host ('NAO CONCLUIDO: '+$_.Exception.Message) -ForegroundColor Red
 exit 1
}
'''
CONFIG_PS=r'''#requires -Version 5.1
$ErrorActionPreference='Stop'
$App=Split-Path $PSScriptRoot -Parent
try {
 $Info=Get-Content -LiteralPath (Join-Path $App 'instalacao.json') -Raw | ConvertFrom-Json
 & $Info.python (Join-Path $App 'configurar_desktop.py')
 if($LASTEXITCODE -ne 0){throw 'A configuracao nao concluiu.'}
} catch {Write-Host $_.Exception.Message -ForegroundColor Red;Read-Host 'Pressione Enter';exit 1}
'''
START_PS=r'''#requires -Version 5.1
$ErrorActionPreference='Stop'
$App=Split-Path $PSScriptRoot -Parent
try {
 $Info=Get-Content -LiteralPath (Join-Path $App 'instalacao.json') -Raw | ConvertFrom-Json
 $Mode=$Info.mode.ToLowerInvariant()
 $Config=Join-Path $env:LOCALAPPDATA ('ForteConnect\'+$Mode+'.json')
 if(!(Test-Path -LiteralPath $Config)){throw 'A ligacao ainda nao foi configurada. Abra o atalho Configurar quando for fazer a ligacao.'}
 Write-Host $Info.title -ForegroundColor Cyan
 Write-Host 'Espelhamento em execucao. Mantenha esta janela aberta. Ctrl+C interrompe.'
 & $Info.python (Join-Path $App 'connect_agent.py') --config $Config --watch
} catch {Write-Host $_.Exception.Message -ForegroundColor Red}
Read-Host 'Pressione Enter para fechar'
'''
AUTO_PS=r'''#requires -Version 5.1
$ErrorActionPreference='Stop'
$App=Split-Path $PSScriptRoot -Parent
$Info=Get-Content -LiteralPath (Join-Path $App 'instalacao.json') -Raw | ConvertFrom-Json
$Config=Join-Path $env:LOCALAPPDATA ('ForteConnect\'+$Info.mode.ToLowerInvariant()+'.json')
if(!(Test-Path -LiteralPath $Config)){Write-Host 'Configure a ligacao antes de ativar o inicio automatico.';Read-Host 'Pressione Enter';exit 1}
$Confirm=Read-Host 'Iniciar automaticamente quando este usuario entrar no Windows? Digite SIM'
if($Confirm -cne 'SIM'){exit 0}
$Action=New-ScheduledTaskAction -Execute $Info.python -Argument ('"'+(Join-Path $App 'connect_agent.py')+'" --config "'+$Config+'" --watch') -WorkingDirectory $App
$Trigger=New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$Settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName ('ForteConnect-'+$Info.mode.ToLowerInvariant()) -Action $Action -Trigger $Trigger -Settings $Settings -Description $Info.title -Force | Out-Null
Write-Host 'Inicio automatico cadastrado; nenhum envio foi iniciado por esta tela.'
Read-Host 'Pressione Enter para fechar'
'''
GUI=r'''"""Mode-bound desktop setup. No credentials are embedded in the package."""
import json, os, socket, webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from connect_agent import ROOT, protect, validate_config
APP=Path(__file__).resolve().parent
PRESET=json.loads((APP/'perfil-do-desktop.json').read_text(encoding='utf-8-sig'))
root=tk.Tk();root.title(PRESET['title']);root.geometry('760x580');root.minsize(640,500)
frame=ttk.Frame(root,padding=20);frame.pack(fill='both',expand=True)
ttk.Label(frame,text=PRESET['title'],font=('Segoe UI',17,'bold'),wraplength=700).pack(anchor='w',pady=(0,12))
ttk.Label(frame,text=PRESET['description'],wraplength=700).pack(anchor='w',pady=6)
ttk.Label(frame,text='Este pacote ja sabe o destino. A credencial sera gerada no painel Forte ao entrar como Master.',wraplength=700).pack(anchor='w',pady=8)
name=tk.StringVar(value=socket.gethostname())
ttk.Label(frame,text='Nome sugerido para cadastrar este computador no painel:').pack(anchor='w')
ttk.Entry(frame,textvariable=name).pack(fill='x',pady=5)
def copy_name():root.clipboard_clear();root.clipboard_append(name.get());root.update()
ttk.Button(frame,text='Copiar nome do computador',command=copy_name).pack(anchor='w')
ttk.Button(frame,text='1. ABRIR PAINEL FORTE PARA BAIXAR A CONFIGURACAO',command=lambda:webbrowser.open(PRESET['panelUrl'])).pack(fill='x',pady=(16,8))
status=tk.StringVar(value='Preparado. Aguardando importar a configuracao do Master e escolher a pasta local.')
def configure():
 try:
  selected=filedialog.askopenfilename(title='Selecione o JSON baixado no painel Espelho Connect',filetypes=[('Configuracao Forte','*.json')])
  if not selected:return
  c=json.loads(Path(selected).read_text(encoding='utf-8-sig'))
  if c.get('mode')!=PRESET['mode'] or c.get('endpoint')!=PRESET['endpoint']:raise ValueError('Este arquivo e de outro desktop/modalidade. Baixe a configuracao no painel indicado acima.')
  folders=[]
  while True:
   folder=filedialog.askdirectory(title=PRESET['folderPrompt'])
   if not folder:break
   if folder not in folders:folders.append(folder)
   if not messagebox.askyesno('Pastas de leitura','Deseja incluir outra pasta? Subpastas ja sao lidas automaticamente.'):break
  if not folders:return
  c['folders']=folders;c['interval_seconds']=60;validate_config(c)
  token=c.pop('token','')
  import re
  if not re.fullmatch(r'cmt_[0-9a-f]{64}',token):raise ValueError('Credencial ausente ou invalida. Baixe uma configuracao nova pelo painel Forte.')
  c['token_dpapi']=protect(token)
  ROOT.mkdir(parents=True,exist_ok=True)
  target=ROOT/(PRESET['mode'].lower()+'.json');temp=target.with_suffix('.tmp')
  temp.write_text(json.dumps(c,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(temp,target)
  status.set('Configuracao salva. NENHUM ENVIO iniciado. Quando autorizado, use o atalho Iniciar.')
  messagebox.showinfo('Configuracao salva','Configuracao protegida e salva neste usuario Windows. Nenhum envio foi iniciado.\n'+('Antes do primeiro envio de vendas, ainda e preciso conferir o formato real do CSV.' if PRESET['mode']=='VENDAS' else 'As notas serao copiadas somente quando voce usar Iniciar.'))
 except Exception as error:messagebox.showerror('Configuracao nao concluida',str(error))
ttk.Button(frame,text='2. IMPORTAR CONFIGURACAO E ESCOLHER PASTA(S)',command=configure).pack(fill='x',pady=8)
ttk.Label(frame,text=PRESET['instructions'],wraplength=700).pack(anchor='w',pady=12)
ttk.Label(frame,textvariable=status,wraplength=700,foreground='#174e83').pack(anchor='w',pady=12)
ttk.Button(frame,text='Fechar - fazer a ligacao depois',command=root.destroy).pack(anchor='e',pady=8)
root.mainloop()
'''
for mode,folder,title,short,panel,desc,prompt,instructions in [
 ('FISCAL_XML','DesktopFiscalMatriz','DESKTOP FISCAL - MATRIZ MG','FORTE Fiscal Matriz','https://forte-fiscal.onrender.com/?forte_view=parametrizacao','Connect Fiscal local da matriz - CNPJ 49.832.961/0001-51. Destino: Forte Fiscal, Matriz, Parametrizacao, Espelho Connect.','Escolha a pasta dos XMLs de notas e eventos do Connect Fiscal','Escolha a MATRIZ no Forte Fiscal. XMLs completos e eventos de cancelamento; nao selecionar apenas PDFs. A filial fiscal continua pelo Omie.'),
 ('VENDAS','DesktopVendasConjunto','DESKTOP VENDAS - MATRIZ E FILIAL JUNTAS','FORTE Vendas Conjunto','https://forte-vendas.onrender.com/','Connect Vendas local - matriz e filial na mesma base comercial. Destino: Forte Vendas, Inicio, Espelho Connect.','Escolha a pasta dos arquivos CSV exportados do Connect Vendas','O agente desta versao le CSV. Ainda precisamos conferir uma exportacao real para mapear colunas e situacoes. Nao le diretamente o banco Connect. Nao separar matriz e filial em dois destinos.')]:
 out=ROOT/folder
 if out.exists():shutil.rmtree(out)
 (out/'Python').mkdir(parents=True);(out/'rotinas').mkdir()
 for name in expected:shutil.copy2(DOWNLOADS/name,out/'Python'/name)
 shutil.copy2(DOWNLOADS/'PYTHON-LICENSE.txt',out/'Python/PYTHON-LICENSE.txt')
 (out/'Python/verificacao.json').write_text(json.dumps(hashes,indent=2),encoding='utf-8')
 (out/'Python/ORIGEM_DOS_INSTALADORES.txt').write_text('Instaladores oficiais, sem modificacao, Python Software Foundation.\nPython 3.11.9: ultima versao 3.11 com instaladores completos oficiais Windows.\nhttps://www.python.org/downloads/release/python-3119/\nhttps://www.python.org/ftp/python/3.11.9/\nA versao 3.11.9 nao e a versao mais recente do Python. Um Python compativel ja instalado e reaproveitado quando disponivel.\nO instalador verifica SHA256 e assinatura Authenticode antes de executar os arquivos incluidos.\n',encoding='utf-8')
 shutil.copy2(AGENT/'connect_agent.py',out/'connect_agent.py')
 preset=dict(version=1,mode=mode,installFolder=folder,title=title,shortcut=short,panelUrl=panel,description=desc,folderPrompt=prompt,instructions=instructions,endpoint=('https://xmfpvvmvdkepmnvtdoio.supabase.co/functions/v1/connect-mirror' if mode=='FISCAL_XML' else 'https://gtwecfyffjszghnvtlzr.supabase.co/functions/v1/connect-mirror'),cnpj=('49832961000151' if mode=='FISCAL_XML' else None),interval_seconds=60,autoStart=False)
 (out/'perfil-do-desktop.json').write_text(json.dumps(preset,ensure_ascii=False,indent=2),encoding='utf-8')
 def ps(name,content):(out/'rotinas'/name).write_text(content,encoding='utf-8-sig',newline='\r\n')
 ps('instalar.ps1',INSTALL);ps('configurar.ps1',CONFIG_PS);ps('iniciar.ps1',START_PS);ps('inicio-automatico.ps1',AUTO_PS)
 (out/'configurar_desktop.py').write_text(GUI,encoding='utf-8')
 cmd='@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\ntitle '+title+'\r\npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0rotinas\\instalar.ps1"\r\necho.\r\npause\r\n'
 (out/'00_INSTALAR_NESTE_DESKTOP.cmd').write_bytes(cmd.encode('ascii'))
 shortcutHelp='Abra o atalho criado na area de trabalho: '+short+' - Configurar\nPara executar o agente depois: '+short+' - Iniciar\n'
 (out/'01_COMO_CONFIGURAR_DEPOIS.txt').write_text(shortcutHelp,encoding='utf-8')
 readme=f'''{title}
PACOTE EXCLUSIVO DESTE COMPUTADOR - PREPARAR AGORA, CONECTAR DEPOIS

{desc}

O FUNCIONARIO FAZ SOMENTE ISTO AGORA:
1. Baixe este ZIP no computador correto.
2. Clique com o botao direito no ZIP e escolha EXTRAIR TUDO.
3. Dentro da pasta extraida, abra 00_INSTALAR_NESTE_DESKTOP.cmd.
4. Aguarde a mensagem PREPARACAO CONCLUIDA.
5. Os atalhos {short} - Configurar e {short} - Iniciar aparecerao na area de trabalho.

O Python 3.11 esta incluido: instaladores oficiais para Windows de 32 e 64 bits.
A preparacao seleciona a arquitetura adequada. Se um Python compativel ja existe, tenta reutiliza-lo.
Caso precise instalar, instala somente para o usuario atual, sem alterar PATH, associacoes de arquivos ou o sistema Connect.
Exige Windows 10/11 Intel/AMD e PowerShell 5.1. Os arquivos necessarios para a instalacao padrao do Python estao no ZIP. A verificacao de certificado do Windows pode depender de conexao e data/hora corretas.
Nao pede senha do Connect, certificado A1 ou CSC.

O QUE JA ESTA PRONTO:
- Destino correto deste desktop e modalidade fixa.
- Identificacao para nao misturar fiscal e vendas.
- Copia do agente para uma pasta permanente do usuario.
- Atalhos Configurar e Iniciar.
- Assistente para importar a credencial do Master, escolher pastas e protege-la pelo Windows.
- Fila local para falta de internet, controle de duplicidades e leitura a cada 60 segundos.

O QUE FICA PARA DEPOIS:
- Entrar como Master no painel Forte e baixar a configuracao exclusiva do computador.
- Abrir o atalho Configurar, importar esse arquivo e selecionar a(s) pasta(s) local(is).
- {instructions}
- Fazer um primeiro envio conhecido e conferir no Forte.

NENHUM ENVIO e iniciado pela instalacao. Nenhuma tarefa automatica e criada agora.
O agente nao altera o Connect, nao emite documentos, nao gera financeiro e nao movimenta estoque operacional.
Arquivos XML nao substituem consulta atual a SEFAZ. O espelho nao comprova assinatura digital.

Local permanente do agente: %LOCALAPPDATA%\\ForteConnect\\{folder}
Configuracao e fila: %LOCALAPPDATA%\\ForteConnect
Pode apagar a pasta ZIP extraida depois de concluir a preparacao; nao apagar a pasta permanente acima.
Logs de instalacao: %LOCALAPPDATA%\\ForteConnect\\Instalacao
Logs do agente: %LOCALAPPDATA%\\ForteConnect\\agente.log

A instalacao real ainda precisa ser executada e conferida no Windows do escritorio.
'''
 (out/'LEIA_PRIMEIRO.txt').write_text(readme,encoding='utf-8-sig')
 if mode=='VENDAS':shutil.copy2(AGENT/'vendas-exemplo.csv',out/'MODELO_FICTICIO_NAO_IMPORTAR.csv')
 archive=ROOT/'output'/('Desktop_Fiscal_Matriz_Com_Python.zip' if mode=='FISCAL_XML' else 'Desktop_Vendas_Conjunto_Com_Python.zip')
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for file in sorted(out.rglob('*')):
   if file.is_file():z.write(file,folder+'/'+str(file.relative_to(out)))
 print(json.dumps({'file':str(archive),'bytes':archive.stat().st_size,'mode':mode,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}),flush=True)
