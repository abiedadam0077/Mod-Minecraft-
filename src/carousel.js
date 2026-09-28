// One controller per rendered carousel. No autoplay: respects reading, swipes and reduced motion.
export function mountCarousel(root,onIndex=()=>{}){
 if(!root)return ()=>{};const track=root.querySelector('.hero-track'),slides=[...root.querySelectorAll('.hero-slide')],count=Number(root.dataset.count);if(!track||!count)return ()=>{};
 const abort=new AbortController(),options={signal:abort.signal};let timer,raf;
 const target=i=>slides[i].offsetLeft-(track.clientWidth-slides[i].clientWidth)/2;
 const go=i=>track.scrollTo({left:target(i),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
 const update=()=>{let nearest=slides.reduce((best,s,i)=>Math.abs(target(i)-track.scrollLeft)<Math.abs(target(best)-track.scrollLeft)?i:best,0);let index=count>1?(nearest-1+count)%count:0;slides.forEach((s,i)=>s.classList.toggle('is-current',i===nearest));root.querySelectorAll('[data-slide]').forEach((b,i)=>{b.classList.toggle('active',i===index);b.setAttribute('aria-current',i===index?'true':'false');});onIndex(index);clearTimeout(timer);timer=setTimeout(()=>{if(count>1&&(nearest===0||nearest===slides.length-1))track.scrollTo({left:target(nearest===0?count:1),behavior:'instant'});},160);};
 root.addEventListener('click',e=>{const button=e.target.closest('[data-slide],[data-carousel-step]');if(!button)return;const current=Number(root.querySelector('[data-slide].active')?.dataset.slide||0);const index=button.dataset.slide!==undefined?Number(button.dataset.slide):(current+Number(button.dataset.carouselStep)+count)%count;go(count>1?index+1:0);},options);
 track.addEventListener('scroll',update,{...options,passive:true});track.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();root.querySelector(`[data-carousel-step="${e.key==='ArrowRight'?1:-1}"]`)?.click();},options);
 const index=Math.min(Number(root.dataset.index||0),count-1);raf=requestAnimationFrame(()=>{track.scrollTo({left:target(count>1?index+1:0),behavior:'instant'});update();});return ()=>{abort.abort();clearTimeout(timer);cancelAnimationFrame(raf);};
}
