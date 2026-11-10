import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {ownerLogoSource} from '../src/lib/ownerLogo.js'
const source=(await readFile(new URL('../src/lib/ownerIdentity.js',import.meta.url),'utf8')).replace("import {supabase} from './supabaseClient'",'const supabase=null').replace("'./ownerLogo'",JSON.stringify(new URL('../src/lib/ownerLogo.js',import.meta.url).href))
const {loadOwnerIdentity}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
function db(records){
 const calls=[]
 return {calls,from(table){const filters=[];calls.push({table,filters});return {select(){return this},eq(key,value){filters.push([key,value]);return this},async maybeSingle(){return {data:(records[table]||[]).find(row=>filters.every(([key,value])=>row[key]===value))||null}}}}}
}
const logo='https://owner.example/logo.png'
const records={bf_assets:[{id:'asset',organization_id:'org',client_id:'owner',site_id:'site'}],bf_sites:[{id:'site',organization_id:'org',client_id:'owner',contract_id:'contract'}],bf_contracts:[{id:'contract',organization_id:'org',client_id:'owner'}],bf_clients:[{id:'owner',organization_id:'org',name:'Hospital owner',logo_url:logo}]}
test('Resolves the owner of a device through its site and contract with organization filters',async()=>{
 const client=db(records),owner=await loadOwnerIdentity({assetId:'asset'},client)
 assert.equal(owner.logo_url,logo);assert.equal(owner.id,'owner')
 assert(client.calls.filter(x=>x.table!=='bf_assets').every(x=>x.filters.some(([key,value])=>key==='organization_id'&&value==='org')))
})
test('Conflicting owner or organization cannot borrow another owners logo',async()=>{
 assert.equal(await loadOwnerIdentity({organizationId:'other',assetId:'asset'},db(records)),null)
 assert.equal(await loadOwnerIdentity({organizationId:'org',clientId:'other',assetId:'asset'},db(records)),null)
 assert.equal(await loadOwnerIdentity({organizationId:'org'},db(records)),null)
})
test('Only the verified contract supplies a legacy fallback logo',async()=>{
 const client=db({...records,bf_clients:[{...records.bf_clients[0],logo_url:null}],bf_owner_report_branding:[{organization_id:'org',contract_id:'contract',owner_logo_data:logo},{organization_id:'other',contract_id:'another',owner_logo_data:'https://wrong.example/logo.png'}]})
 assert.equal((await loadOwnerIdentity({assetId:'asset'},client)).logo_url,logo)
})
test('Rejects executable and credential-bearing image URLs; permits raster logos',()=>{
 for(const src of ['javascript:alert(1)','data:text/html;base64,YQ==','data:image/svg+xml;base64,YQ==','https://u:p@example.com/logo.png','//other.example/logo.png'])assert.equal(ownerLogoSource(src),'')
 assert.equal(ownerLogoSource('data:image/png;base64,YQ=='),'data:image/png;base64,YQ==')
 assert.equal(ownerLogoSource(logo),logo)
})
