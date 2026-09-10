import React,{useRef,useState}from'react';

const allowed=new Set(['image/png','image/jpeg','image/webp']);

export default function ImageImport({file,previewUrl,savedName,onSelect,setMsg}){
  const input=useRef(null),[dragging,setDragging]=useState(false);
  function receive(next){
    setDragging(false);
    if(!next)return;
    if(!allowed.has(next.type)){setMsg('PNG、JPEG、WebPの画像を選択してください。');return}
    if(next.size>8*1024*1024){setMsg('画像サイズは8MB以下にしてください。');return}
    onSelect(next);
  }
  return <section className={`image-import ${dragging?'dragging':''}`} onDragEnter={event=>{event.preventDefault();setDragging(true)}} onDragOver={event=>event.preventDefault()} onDragLeave={event=>{if(event.currentTarget===event.target)setDragging(false)}} onDrop={event=>{event.preventDefault();receive(event.dataTransfer.files?.[0])}}><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>receive(event.target.files?.[0])}/>{previewUrl?<img src={previewUrl} alt="取り込み画像のプレビュー"/>:<div className="image-import-empty">IMAGE</div>}<div><b>{file?.name||savedName||'イラスト画像を選択'}</b><p>クリックして選択、または画像をドロップ</p><small>PNG / JPEG / WebP・最大8MB</small></div><button type="button" onClick={()=>input.current?.click()}>{file?'画像を変更':'画像を取り込む'}</button></section>;
}
