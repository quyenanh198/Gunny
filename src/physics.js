export const WIDTH=1200, HEIGHT=620, DT=1/120, GRAVITY=290, BODY_OFFSET=20;
export const DEFAULT_AMMO={gravityScale:1,windScale:1,craterRadius:48,damageMax:42,damageRadius:95};
export function makeTerrain(){return Array.from({length:WIDTH},(_,x)=>440+24*Math.sin(x/140)+12*Math.sin(x/57));}
export function launch(actor,angle,power,ammo=DEFAULT_AMMO){const r=angle*Math.PI/180,s=160+power*6;return{x:actor.x+Math.cos(r)*30,y:actor.y-30-Math.sin(r)*30,vx:Math.cos(r)*s,vy:-Math.sin(r)*s,age:0,ammo};}
export function step(p,wind,dt=DT){p.vx+=wind*p.ammo.windScale*dt;p.vy+=GRAVITY*p.ammo.gravityScale*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.age+=dt;return p;}
export function collides(p,terrain){return p.x>=0&&p.x<WIDTH&&p.y>=terrain[Math.floor(p.x)];}
export function crater(terrain,x,y,r=48){for(let i=Math.max(0,Math.floor(x-r));i<Math.min(WIDTH,x+r);i++){const depth=Math.sqrt(r*r-(i-x)**2);terrain[i]=Math.max(terrain[i],y+depth);}}
export function fallDamage(drop){return drop>40?Math.round(drop/4):0;}
export function damage(actor,x,y,ammo=DEFAULT_AMMO){return Math.round(Math.max(0,ammo.damageMax*(1-Math.hypot(actor.x-x,actor.y-BODY_OFFSET-y)/ammo.damageRadius)));}
export function simulate(actor,angle,power,wind,terrain,ammo=DEFAULT_AMMO){let p=launch(actor,angle,power,ammo);for(let i=0;i<1800;i++){step(p,wind);if(collides(p,terrain)||p.x<0||p.x>=WIDTH||p.y>HEIGHT)return p;}return p;}
export function botShot(actor,target,wind,terrain,random=Math.random,ammo=DEFAULT_AMMO){let best={error:Infinity,angle:135,power:60};for(let angle=25;angle<=155;angle+=3)for(let power=15;power<=100;power+=2){const p=simulate(actor,angle,power,wind,terrain,ammo),error=Math.hypot(p.x-target.x,p.y-target.y);if(error<best.error)best={error,angle,power};}return{angle:best.angle+(random()-.5)*3,power:Math.max(1,Math.min(100,best.power+(random()-.5)*5))};}
