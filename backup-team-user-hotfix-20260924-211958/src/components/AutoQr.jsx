import {useEffect,useState} from 'react'
import QRCode from 'qrcode'
export default function AutoQr({value,size=150}){
 const [src,setSrc]=useState('')
 useEffect(()=>{let ok=true;if(!value){setSrc('');return}
  QRCode.toDataURL(value,{width:size,margin:1}).then(x=>ok&&setSrc(x)).catch(()=>ok&&setSrc(''))
  return()=>{ok=false}
 },[value,size])
 if(!src)return null
 return <img src={src} width={size} height={size} alt="QR" className="auto-qr"/>
}
