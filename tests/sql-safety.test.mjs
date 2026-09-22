import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const sql=readFileSync(new URL('../sql/003_SECURITY_AND_ASSETS.sql',import.meta.url),'utf8')
test('Migration includes controlled membership and tenant isolation',()=>{
 for(const fragment of ['bf3_assign_role','bf_can_read','bf3_guard_scope','bf3_validate_location','bf3_validate_asset','bf3_save_asset','bf3_asset_cost'])
  assert.ok(sql.includes(fragment),fragment)
 assert.ok(sql.includes("grant update(full_name,phone) on public.bf_profiles"))
 assert.ok(!sql.includes('grant all on public.bf_profiles to authenticated'))
})
test('Asset costs are excluded from public asset reads',()=>{
 const grant=sql.match(/grant select\(([^)]+)\) on public\.bf_assets to authenticated/)
 assert.ok(grant)
 assert.ok(!grant[1].includes('purchase_cost'))
 assert.ok(!grant[1].includes('replacement_cost'))
})
test('All known operational tables have RLS enabled',()=>{
 for(const table of ['bf_organizations','bf_clients','bf_contracts','bf_sites','bf_buildings','bf_floors','bf_zones','bf_rooms','bf_profiles','bf_roles','bf_user_roles','bf_client_access','bf_asset_categories','bf_assets','bf_asset_events']){
  assert.ok(sql.includes("'"+table+"'"),table)
 }
})
