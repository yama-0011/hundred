import React,{useState}from'react';

export const defaultLevels=()=>[{level:1,requiredCores:1,bp:0}];

export default function BpPicker({value,onChange}){
  const[open,setOpen]=useState(false),[draft,setDraft]=useState(value);
  function begin(){setDraft(value.map(row=>({...row})));setOpen(true)}
  function enabled(level){return draft.some(row=>row.level===level)}
  function toggle(level,on){setDraft(rows=>on?[...rows,{level,requiredCores:level,bp:0}].sort((a,b)=>a.level-b.level):rows.filter(row=>row.level!==level))}
  function field(level,key,raw){setDraft(rows=>rows.map(row=>row.level===level?{...row,[key]:Math.max(0,Number(raw)||0)}:row))}
  return <div className="bp-picker"><span className="bp-picker-label">BP <small>LEVEL / CORE / BP</small></span><div className="bp-summary">{value.map(row=><span key={row.level}><b>Lv{row.level}</b> コア {row.requiredCores}<strong>BP {row.bp.toLocaleString()}</strong></span>)}</div><button type="button" className="bp-open" onClick={begin}>BP詳細を開く</button>{open&&<div className="card-detail-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="card-detail bp-dialog" role="dialog" aria-modal="true" aria-label="BPを設定"><div className="card-detail-head"><div><p>BATTLE POINT</p><h2>BP詳細を設定</h2></div><button type="button" className="card-detail-close" onClick={()=>setOpen(false)}>×</button></div><div className="bp-table-head"><span>レベル</span><span>要否</span><span>必要コア数</span><span>BP</span></div>{[1,2,3].map(level=>{const on=level===1||enabled(level),row=draft.find(item=>item.level===level);return <div className={'bp-row '+(on?'':'disabled')} key={level}><b>Lv{level}</b><label className="bp-required"><input type="checkbox" checked={on} disabled={level===1} onChange={e=>toggle(level,e.target.checked)}/>{level===1?'必須':'使用する'}</label><input type="number" min="0" max="99" disabled={!on} value={row?.requiredCores??level} onChange={e=>field(level,'requiredCores',e.target.value)}/><input type="number" min="0" max="999999" step="1000" disabled={!on} value={row?.bp??0} onChange={e=>field(level,'bp',e.target.value)}/></div>})}<p className="bp-note">Lv1は必須です。Lv2・Lv3は使用する場合だけ有効にしてください。</p><button type="button" className="primary wide" onClick={()=>{onChange(draft);setOpen(false)}}>設定を反映</button></section></div>}</div>;
}
