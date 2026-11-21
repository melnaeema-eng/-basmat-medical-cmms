export const readStatementCertificates=(rpc,statement)=>rpc('bf44_statement_documents',{p_statement:statement})
export const registerStatementCertificate=(rpc,statement,document)=>rpc('bf44_register_statement_document',{p_statement:statement,p_document:document})
