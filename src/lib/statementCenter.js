// Keep the statement screen independent of the operational maintenance center.
export function loadStatementCenter(rpc,organization){
 return rpc('bf44_statement_center',{p_org:organization||null})
}
