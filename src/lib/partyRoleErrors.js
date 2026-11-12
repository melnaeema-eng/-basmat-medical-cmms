export function partyRoleError(error,lang='en',fallback){
 const message=String(error?.message||error||'')
 if(message.includes('OWNER_PROVIDER_CONFLICT'))return lang==='ar'
  ?'لا يمكن تسجيل الجهة نفسها كمالك وشركة صيانة. اختر جهة مختلفة للدور المطلوب.'
  :'The same entity cannot be both an owner and a maintenance company. Select a different entity for this role.'
 return fallback??message
}
