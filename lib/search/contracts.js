function isObject(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}

export function validatePythonPersonSearchResponse(value){
  if(!isObject(value)) return null;
  if(value.person!==null&&!isObject(value.person)) return null;
  if(!Array.isArray(value.filmography)||!Array.isArray(value.results)) return null;
  if(!isObject(value.availabilitySummary)) return null;
  if(typeof value.verified!=='boolean') return null;
  return value;
}
