import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderReturnMessage} from '../apps/web/src/frete-sync.mjs';

const waiting = 'Pedido vinculado. O retorno ao Frete aguarda nova sincronização.';
const confirmed = 'Pedido vinculado e retorno confirmado no Frete.';
test('order return requires a receipt for this exact event', () => {
  assert.equal(orderReturnMessage({ok:true,confirmedEvents:['event']}, null, 'event'), confirmed);
  assert.equal(orderReturnMessage({ok:true,confirmedEvents:['event'],pending:['other']}, null, 'event'), confirmed);
  for (const result of [null, {}, {error:'bridge unavailable'}, {ok:true},
    {ok:true,confirmedEvents:[]}, {ok:true,confirmedEvents:['other']},
    {ok:true,confirmedEvents:['event'],pending:['event']}]) {
    assert.equal(orderReturnMessage(result, null, 'event'), waiting);
  }
  assert.equal(orderReturnMessage({ok:true,confirmedEvents:['event']}, new Error('network'), 'event'), waiting);
  assert.equal(orderReturnMessage({ok:true,confirmedEvents:['event']}, null, undefined), waiting);
});
