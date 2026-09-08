import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateMaster,validateDeck} from '../src/validation.js';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const master=validateMaster(JSON.parse(readFileSync(process.argv[2]||'data/master-poc-001.json','utf8')));
const content=JSON.stringify(master), hash=createHash('sha256').update(content).digest('hex');
const q=x=>"'"+x.replaceAll("'","''")+"'";
let sql=`INSERT INTO master_releases(version,content_json,sha256) VALUES (${q(master.masterVersion)},${q(content)},${q(hash)}) ON CONFLICT(version) DO UPDATE SET sha256=excluded.sha256 WHERE master_releases.sha256 <> excluded.sha256;\n`;
const sample=JSON.parse(readFileSync(process.argv[3]||'data/sample-deck.json','utf8'));
if(process.argv[3]&&(sample.masterVersion!==master.masterVersion||typeof sample.deckId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(sample.deckId)||typeof sample.name!=='string'||!sample.name.trim()))throw new Error('invalid_sample_deck');
if(sample.masterVersion===master.masterVersion){const cards=validateDeck(sample.cards,master);sql+=`INSERT INTO decks(deck_id,name,master_version,cards_json) VALUES (${q(sample.deckId)},${q(sample.name)},${q(sample.masterVersion)},${q(JSON.stringify(cards))}) ON CONFLICT(deck_id) DO UPDATE SET name=excluded.name WHERE decks.name <> excluded.name OR decks.master_version <> excluded.master_version OR decks.cards_json <> excluded.cards_json;\n`;}
const path='.seed-'+process.pid+'.sql';
try{writeFileSync(path,sql);execFileSync('node',['node_modules/wrangler/bin/wrangler.js','d1','execute','hundred-card-home-local','--local','--file',path],{stdio:'inherit'});}finally{unlinkSync(path);}
console.log('公開マスタ '+master.masterVersion+' を登録しました。同一バージョンの内容変更は禁止しています。');
