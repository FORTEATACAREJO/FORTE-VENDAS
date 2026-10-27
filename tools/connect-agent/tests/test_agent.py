import sys, unittest, tempfile, json, os, time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'agent'))
from connect_agent import Queue,sales_records,scan,validate_config,ENDPOINTS
SETTINGS={'delimiter':';','encoding':'utf-8-sig','decimal':',','source_system':'CONNECT','columns':dict(sourceCompany='empresa',saleId='venda',updatedAt='atualizado_em',date='data_venda',status='situacao',customer='cliente',total='total_venda',line='item',code='codigo',description='produto',unit='unidade',quantity='quantidade',unitPrice='preco_unitario',itemTotal='total_item'),'statuses':{'CONCLUIDA':'CONCLUIDA','CANCELADA':'CANCELADA'}}
RAW=(Path(__file__).parents[1]/'agent/vendas-exemplo.csv').read_bytes()
class AgentTests(unittest.TestCase):
 def test_csv_preserves_identity_and_parses_decimal(self):
  r=sales_records(RAW,SETTINGS)[0]['sale'];self.assertEqual(r['items'][0]['unitPrice'],'10.00');self.assertEqual(r['sourceCompany'],'CONJUNTO')
 def test_whole_export_rejected_for_partial_duplicate_or_unknown_status(self):
  for raw in [RAW+RAW.splitlines()[1]+b'\n',RAW.replace(b'CONCLUIDA',b'INVENTADA'),RAW.replace(b';2;10,00',b';-2;10,00'),RAW.replace(b'quantidade',b'inexistente')]:
   with self.assertRaises(ValueError):sales_records(raw,SETTINGS)
 def test_cancel_is_explicit_and_never_inferred_from_absence(self):
  self.assertEqual(sales_records(RAW.replace(b'CONCLUIDA',b'CANCELADA'),SETTINGS)[0]['sale']['status'],'CANCELADA')
  self.assertEqual(sales_records(RAW.splitlines()[0]+b'\n',SETTINGS),[])
 def test_offline_queue_survives_restart_deduplicates_and_retries(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'queue.db';q=Queue(p);rows=sales_records(RAW,SETTINGS);q.stage('a','digest',rows);q.stage('b','digest',rows);self.assertEqual(len(q.pending()),1)
   h=q.pending()[0][0];q.retry(h,0,503);q.db.close();q=Queue(p);self.assertEqual(q.counts(),{'PENDING':1});q.db.execute('update queue set next_at=0');self.assertEqual(len(q.pending()),1);q.ack(h);self.assertEqual(q.pending(),[])
 def test_scan_does_not_modify_source_and_changed_file_is_new_snapshot(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d)/'exports';root.mkdir();file=root/'vendas.csv';file.write_bytes(RAW);os.utime(file,(time.time()-10,time.time()-10));q=Queue(Path(d)/'q.db');c={'mode':'VENDAS','folders':[str(root)],'sales':SETTINGS};self.assertEqual(scan(c,q),[]);self.assertEqual(file.read_bytes(),RAW);scan(c,q);self.assertEqual(q.counts()['PENDING'],1)
   file.write_bytes(RAW.replace(b'CONCLUIDA',b'CANCELADA'));os.utime(file,(time.time()-10,time.time()-10));scan(c,q);self.assertEqual(q.counts()['PENDING'],2)
 def test_endpoint_not_configurable_to_exfiltrate_credentials(self):
  with self.assertRaises(ValueError):validate_config({'version':1,'mode':'VENDAS','endpoint':'https://example.com','folders':['.']})
if __name__=='__main__':unittest.main()
