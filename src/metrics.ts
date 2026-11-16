export const localDate=(date:string)=>new Date(date).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
export function totals(moves:any[],month:string){
 const monthly=moves.filter(m=>localDate(m.date).slice(0,7)===month);
 let revenue=0,cogs=0,purchases=0,units=0;
 for(const m of monthly){
  const type=m.type==='reversal'?m.originalType:m.type,sign=m.type==='reversal'?-1:1;
  if(type==='out'){revenue+=sign*m.qty*m.price;cogs+=sign*m.qty*(m.cost||0);units+=sign*m.qty}
  // Estoque inicial tem tipo próprio ('opening') e não conta como compra.
  if(type==='in')purchases+=sign*m.qty*(m.cost||0);
 }
 return {monthly,revenue,profit:revenue-cogs,purchases,units};
}
