const EMPRESAS = ['PLTR','APP','CRWD','NOW','SNOW','DDOG','NET','MDB','ZS','PANW','TTD','DUOL','HIMS','RDDT','CELH','AXON','ANET','VRT','SOUN','RKLB','IOT','S','GTLB','PATH','TEM'];
const BASE = 'https://financialmodelingprep.com/stable';
const VALIDADE = 24 * 3600 * 1000;

const $ = id => document.getElementById(id);
const chave = () => localStorage.getItem('fmpKey');

function guardarChave() {
  const k = $('chave').value.trim();
  if (!k) return;
  localStorage.setItem('fmpKey', k);
  $('setup').style.display = 'none';
  atualizar(true);
}
function mudarChave() {
  $('setup').style.display = 'block';
  $('chave').value = chave() || '';
}

async function api(caminho, simbolo, extra) {
  const url = BASE + caminho + '?symbol=' + simbolo + (extra || '') + '&apikey=' + chave();
  const r = await fetch(url);
  const texto = await r.text();
  let d;
  try { d = JSON.parse(texto); } catch (e) { throw new Error(texto.slice(0, 120)); }
  if (!Array.isArray(d)) throw new Error('Resposta inesperada');
  return d;
}

const num = v => Number(v) || 0;
const soma = (arr, campo) => arr.reduce((a, x) => a + num(x[campo]), 0);

async function analisarEmpresa(s) {
  // O plano gratuito permite no maximo 5 trimestres por pedido.
  const [dem, bal, cx, quote] = await Promise.all([
    api('/income-statement', s, '&period=quarter&limit=5'),
    api('/balance-sheet-statement', s, '&period=quarter&limit=1'),
    api('/cash-flow-statement', s, '&period=quarter&limit=4'),
    api('/quote', s)
  ]);
  if (dem.length < 5) throw new Error('Historico insuficiente');

  // dem[0] = trimestre mais recente; dem[4] = o mesmo trimestre um ano antes
  const ult4 = dem.slice(0, 4);
  const recU = soma(ult4, 'revenue');

  // Crescimento do ultimo trimestre face ao mesmo trimestre do ano anterior
  const cresc = dem[4].revenue ? (num(dem[0].revenue) / num(dem[4].revenue) - 1) * 100 : 0;

  // Aceleracao: o crescimento sequencial do ultimo trimestre vs o anterior
  const seqRec = dem[1].revenue ? (num(dem[0].revenue) / num(dem[1].revenue) - 1) * 100 : 0;
  const seqAnt = dem[2].revenue ? (num(dem[1].revenue) / num(dem[2].revenue) - 1) * 100 : 0;
  const acelera = seqRec > seqAnt && seqRec > 0;

  const mb = recU ? soma(ult4, 'grossProfit') / recU * 100 : 0;
  const mo = recU ? soma(ult4, 'operatingIncome') / recU * 100 : 0;

  // Margem operacional do ultimo trimestre vs a do trimestre mais antigo da janela
  const moRecente = num(dem[0].revenue) ? num(dem[0].operatingIncome) / num(dem[0].revenue) * 100 : -999;
  const moAntiga = num(dem[3].revenue) ? num(dem[3].operatingIncome) / num(dem[3].revenue) * 100 : -999;
  const opSobe = moRecente > moAntiga;
  const r40 = cresc + mo;

  const fcf = soma(cx, 'freeCashFlow');
  const b = bal[0] || {};
  const caixa = num(b.cashAndShortTermInvestments);
  const divida = num(b.totalDebt);

  const q = quote[0] || {};
  const preco = num(q.price);
  const max52 = num(q.yearHigh);
  const distMax = max52 ? (1 - preco / max52) * 100 : 100;

  const crit = [
    ['Receitas a crescer acima de 30%', cresc > 30, 15, cresc.toFixed(0) + '%'],
    ['Crescimento a acelerar', acelera, 15, seqRec.toFixed(0) + '% vs ' + seqAnt.toFixed(0) + '%'],
    ['Margem bruta acima de 70%', mb > 70, 12, mb.toFixed(0) + '%'],
    ['Margem operacional positiva e a subir', mo > 0 && opSobe, 12, mo.toFixed(0) + '%'],
    ['Regra dos 40 acima de 40', r40 > 40, 15, r40.toFixed(0)],
    ['Caixa livre positivo', fcf > 0, 10, (fcf / 1e6).toFixed(0) + ' M$'],
    ['Mais caixa do que divida', caixa >= divida, 8, (caixa / 1e6).toFixed(0) + ' vs ' + (divida / 1e6).toFixed(0) + ' M$'],
    ['Preco a menos de 15% do maximo anual', distMax < 15, 13, distMax.toFixed(0) + '% abaixo']
  ];
  const pontos = crit.reduce((a, c) => a + (c[1] ? c[2] : 0), 0);
  return { s, nome: q.name || s, pontos, crit };
}

async function atualizar(forcar) {
  if (!chave()) { $('setup').style.display = 'block'; return; }
  const guardado = JSON.parse(localStorage.getItem('radar') || 'null');
  if (!forcar && guardado && Date.now() - guardado.quando < VALIDADE) {
    mostrar(guardado.dados, guardado.quando);
    return;
  }
  const dados = [];
  for (let i = 0; i < EMPRESAS.length; i++) {
    $('estado').textContent = 'A analisar ' + EMPRESAS[i] + ' (' + (i + 1) + '/' + EMPRESAS.length + ')...';
    try { dados.push(await analisarEmpresa(EMPRESAS[i])); }
    catch (e) { dados.push({ s: EMPRESAS[i], nome: 'Sem dados', pontos: -1, crit: [], erro: e.message }); }
    mostrar(dados, null);
  }
  localStorage.setItem('radar', JSON.stringify({ quando: Date.now(), dados }));
  mostrar(dados, Date.now());
}

function mostrar(dados, quando) {
  const ord = [...dados].sort((a, b) => b.pontos - a.pontos);
  $('lista').innerHTML = ord.map((e, i) => {
    const det = e.crit.map(c => '' + c[0] + '' + (c[1] ? '\u2714 ' : '\u2718 ') + c[3] + '').join('') || '' + (e.erro || '') + '';
    return '' +
      '' + (i + 1) + '' + e.s + '' + e.nome + '' +
      '' + (e.pontos >= 0 ? e.pontos : '--') + '' +
      '' +
      '' + det + '';
  }).join('');
  $('estado').textContent = quando ? 'Atualizado em ' + new Date(quando).toLocaleString('pt-PT') : 'A atualizar...';
}

atualizar(false);
