import test from 'node:test'
import assert from 'node:assert/strict'
import {findMedicalLibraryModels} from '../src/lib/medicalLibrarySearch.js'
const master={types:[{id:'vent',code:'MED-VENTILATOR',name_ar:'جهاز تنفس صناعي',name_en:'Ventilator',status:'active'}],manufacturers:[{id:'drager',name:'Dräger',status:'active'}],options:[{id:'savina',asset_type_id:'vent',manufacturer_id:'drager',model_family:'Savina 300',status:'active'},{id:'old',asset_type_id:'vent',manufacturer_id:'drager',model_family:'Old model',status:'inactive'}]}
test('Finds newly catalogued models by accented brand, unaccented brand, model, Arabic name and code',()=>{
 for(const query of ['Dräger','Drager','SAVINA 300','جِهَاز تنفس','MED-VENTILATOR']){
  assert.deepEqual(findMedicalLibraryModels(master,query).map(x=>x.option.id),['savina'])
 }
})
test('Does not turn catalog results into registered assets and excludes missing or inactive catalog links',()=>{
 assert.equal(findMedicalLibraryModels(master,'unmatched').length,0)
 const rows=findMedicalLibraryModels(master)
 assert.equal(rows.length,1)
 assert.equal(rows[0].asset_id,undefined)
 assert.equal(findMedicalLibraryModels({...master,manufacturers:[{...master.manufacturers[0],status:'inactive'}]},'Savina').length,0)
})
