type FamilyIdentity={id:string};
const preferenceKey=(userId:string)=>'famsync-default-family:'+userId;

export function defaultFamily<T extends FamilyIdentity>(families:T[],userId:string):T|undefined {
  let preferred:string|null=null;
  try{preferred=localStorage.getItem(preferenceKey(userId));}catch{}
  return families.find(family=>family.id===preferred)??families[0];
}

export function saveDefaultFamily(userId:string,familyId:string) {
  try{localStorage.setItem(preferenceKey(userId),familyId);return true;}catch{return false;}
}
