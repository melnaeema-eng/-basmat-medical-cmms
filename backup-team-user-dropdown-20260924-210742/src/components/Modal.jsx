import {useEffect,useRef,useState} from 'react'

export default function Modal({open,title,children,onClose}){
  const [position,setPosition]=useState({x:0,y:0})
  const [maximized,setMaximized]=useState(false)
  const dragRef=useRef(null)

  useEffect(()=>{
    if(open){
      setPosition({x:0,y:0})
      setMaximized(false)
    }
  },[open])

  useEffect(()=>{
    const move=e=>{
      if(!dragRef.current||maximized)return
      const {startX,startY,baseX,baseY}=dragRef.current
      setPosition({
        x:baseX+(e.clientX-startX),
        y:baseY+(e.clientY-startY)
      })
    }
    const up=()=>{dragRef.current=null}
    window.addEventListener('pointermove',move)
    window.addEventListener('pointerup',up)
    return ()=>{
      window.removeEventListener('pointermove',move)
      window.removeEventListener('pointerup',up)
    }
  },[maximized])

  if(!open)return null

  const beginDrag=e=>{
    if(maximized)return
    if(e.target.closest('button'))return
    dragRef.current={
      startX:e.clientX,
      startY:e.clientY,
      baseX:position.x,
      baseY:position.y
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const cardStyle=maximized?{
    position:'absolute',
    inset:'2vh 2vw',
    width:'96vw',
    height:'96vh',
    maxWidth:'96vw',
    maxHeight:'96vh',
    minWidth:0,
    minHeight:0,
    overflow:'auto',
    resize:'none',
    transform:'none'
  }:{
    position:'absolute',
    left:`calc(50% + ${position.x}px)`,
    top:`calc(50% + ${position.y}px)`,
    transform:'translate(-50%,-50%)',
    width:'min(900px,92vw)',
    height:'auto',
    maxWidth:'96vw',
    maxHeight:'88vh',
    minWidth:'360px',
    minHeight:'220px',
    overflow:'auto',
    resize:'both'
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={onClose}
      style={{position:'fixed',inset:0}}
    >
      <div
        className="modal-card"
        onMouseDown={e=>e.stopPropagation()}
        style={cardStyle}
      >
        <div
          className="modal-header"
          onPointerDown={beginDrag}
          style={{
            cursor:maximized?'default':'move',
            userSelect:'none',
            position:'sticky',
            top:0,
            zIndex:20
          }}
        >
          <h3>{title}</h3>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            {!maximized&&
              <button
                type="button"
                className="icon-btn"
                title="Center / توسيط"
                onClick={()=>setPosition({x:0,y:0})}
              >⌖</button>
            }
            <button
              type="button"
              className="icon-btn"
              title={maximized?'Restore / استعادة':'Maximize / تكبير'}
              onClick={()=>setMaximized(v=>!v)}
            >{maximized?'❐':'□'}</button>
            <button
              type="button"
              className="icon-btn"
              title="Close / إغلاق"
              onClick={onClose}
            >×</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
