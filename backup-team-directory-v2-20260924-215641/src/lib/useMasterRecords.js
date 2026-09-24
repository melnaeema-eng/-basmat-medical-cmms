import {useCallback,useEffect,useRef,useState} from 'react'
import {readMasterBundle,readMaster,writeMaster,applyMasterRow} from './masterRecords'

export function useMasterRecords(key){
 const [rows,setRows]=useState([]),[bundle,setBundle]=useState({organizations:[],clients:[],contracts:[],sites:[]})
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const alive=useRef(true),seq=useRef(0)
 const refresh=useCallback(async({silent=false}={})=>{
  const n=++seq.current
  if(!silent)setLoading(true)
  setError('')
  try{
   const data=await readMasterBundle()
   if(alive.current&&n===seq.current){setBundle(data);setRows(data[key]||[])}
  }catch(e){if(alive.current&&n===seq.current)setError(e.message)}
  finally{if(alive.current&&n===seq.current)setLoading(false)}
 },[key])
 useEffect(()=>{alive.current=true;refresh();return()=>{alive.current=false;++seq.current}},[refresh])
 const persist=async(form,id)=>{
  setBusy(true);setError('');setSuccess('')
  try{
   const saved=await writeMaster(key,form,id)
   if(alive.current){
    setRows(old=>applyMasterRow(old,saved))
    setBundle(old=>({...old,[key]:applyMasterRow(old[key]||[],saved)}))
    setSuccess('saved')
   }
   // Re-read the authoritative database after the immediate local update.
   const data=await readMasterBundle()
   if(alive.current){
    setBundle(data);setRows(data[key]||[])
   }
   return saved
  }catch(e){if(alive.current)setError(e.message);throw e}
  finally{if(alive.current)setBusy(false)}
 }
 const changeStatus=async(row,status)=>persist({...row,status},row.id)
 return {rows,bundle,loading,busy,error,success,setError,setSuccess,refresh,persist,changeStatus}
}
