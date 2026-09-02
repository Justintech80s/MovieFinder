export function createNoopProvider(){return {name:'disabled',async generateStructured(){return {available:false,ok:false,data:null,reason:'ai-disabled'};}};}
