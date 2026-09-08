import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateMaster,validateDeck} from '../src/validation.js';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const sourcePath='data/authoring/bs01/bs01-red.authoring.json';
const sourceBytes=readFileSync(sourcePath,'utf8');
const source=JSON.parse(sourceBytes);
if(source.authoringSchemaVersion!==1||source.effectPolicy!=='DISABLED')throw new Error('Unsupported authoring schema or effect policy');
const version=process.argv[2]||'bs01-red-001';
if(!/^[A-Za-z0-9_-]{1,60}$/.test(version))throw new Error('Invalid release version');
const expected=['001','003','006','007','008','009','010','012','013','014','015','016','018','019','020','021','022','024','025'].map(n=>'BS01-'+n);
const spirits=source.cards.filter(c=>c.cardType==='SPIRIT').sort((a,b)=>a.cardId.localeCompare(b.cardId));
if(JSON.stringify(spirits.map(c=>c.cardId))!==JSON.stringify(expected))throw new Error('Expected the selected 19 BS01 spirits');
for(const c of spirits){
 if(c.source?.reviewStatus!=='transcribed'||c.effectExecution!=='DISABLED'||c.effects?.length!==0)throw new Error('Card is not ready: '+c.cardId);
}
// Runtime projection: the editable source retains names, ruby, effect text and references.
const cards=spirits.map(c=>({cardId:c.cardId,name:c.name,cardType:c.cardType,color:c.color,cost:c.cost,tribe:c.tribe,reductions:c.reductions,symbols:c.symbols,levels:c.levels,effectText:'効果なし',effects:[],illustration:c.illustration}));
const master=validateMaster({schemaVersion:1,masterVersion:version,rulesVersion:'core-1',cards});
// 19 x 2 + one additional Goradon and Teranosaber = 40, no filler cards.
const deck={deckId:'deck-'+version,name:'BS01 赤19種・効果無効',masterVersion:version,cards:validateDeck(cards.map(c=>({cardId:c.cardId,count:['BS01-001','BS01-003'].includes(c.cardId)?3:2})),master)};
const stringify=x=>JSON.stringify(x,null,2)+'\n';
const masterText=stringify(master),deckText=stringify(deck);
const manifest={masterVersion:version,source:sourcePath,sourceSha256:createHash('sha256').update(sourceBytes).digest('hex'),runtimeSha256:createHash('sha256').update(JSON.stringify(master)).digest('hex'),effectPolicy:'DISABLED',includedCardIds:cards.map(c=>c.cardId),excludedCards:source.cards.filter(c=>c.cardType!=='SPIRIT').map(c=>({cardId:c.cardId,cardType:c.cardType,reason:'Runtime currently supports spirits only'})),imagePolicy:'Only illustration object keys; full-card reference images are not delivery art'};
const dir='data/releases/'+version;
const outputs=[[dir+'/master.json',masterText],[dir+'/deck.json',deckText],[dir+'/manifest.json',stringify(manifest)]];
// Never silently replace an already generated release, even before DB publication.
for(const [path,text] of outputs)if(existsSync(path)&&readFileSync(path,'utf8')!==text)throw new Error('Release differs; use a new version: '+path);
mkdirSync(dir,{recursive:true});for(const [path,text] of outputs)writeFileSync(path,text);
console.log('公開用ファイルを生成しました：'+dir+' / 19種類・40枚。DB登録はまだ行っていません。');
