// A unique RPC name avoids PostgREST's ambiguous matching of defaulted overloads.
export const cycleCenterName = 'bf44_cycle_center'

export async function loadCycleCenter(rpc, organization) {
  const args = {p_org: organization || null}
  try {
    return await rpc(cycleCenterName, args)
  } catch (error) {
    // Older 044 installations may still expose only the original single-arg RPC.
    // Never retry permission, database or transport failures through another API.
    if (error?.code !== 'PGRST202') throw error
  }
  try {
    return await rpc('bf44_center', args)
  } catch (error) {
    if (error?.code !== 'PGRST203') throw error
    const repair = new Error('Run manual SQL 045 to repair the maintenance center RPC name conflict.')
    repair.code = 'BF44_CENTER_OVERLOAD'
    repair.cause = error
    throw repair
  }
}
