import React from'react';

const assetColor={RED:'red',PURPLE:'purple',GREEN:'green',WHITE:'white',YELLOW:'yellow',BLUE:'blue'};

export default function ReductionPicker({value,onChange,color='RED'}){
  const symbolSrc=`/template-assets/symbols/${assetColor[color]||'red'}.png`;
  return <div className="reduction-picker"><label>軽減シンボル数<select value={value} onChange={event=>onChange(Number(event.target.value))}><option value="0">なし</option>{[1,2,3,4,5,6].map(count=><option value={count} key={count}>{count}</option>)}</select></label><div className="reduction-preview" aria-label={`軽減シンボル ${value}個`}>{Array.from({length:value},(_,index)=><img src={symbolSrc} alt="" key={index}/>)}</div></div>;
}
