 (async function(){
  try{
    const res = await fetch('http://localhost:3000/api/dashboard/pending-products');
    const text = await res.text();
    console.log('Status:', res.status);
    console.log(text);
  }catch(e){
    console.error('Fetch error:', e.message);
    process.exit(1);
  }
})();
