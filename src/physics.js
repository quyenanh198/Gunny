export const WIDTH=1200, HEIGHT=620, DT=1/120, GRAVITY=290, BODY_OFFSET=20;
// A blast within HIT_RADIUS of the body center is a direct hit: full damage. Splash falls off linearly past it.
export const HIT_RADIUS=24;
// Half the character's stance width, matching the shadow drawn under the sprite: a crater narrower than FOOT_WIDTH*2 leaves them standing on one edge instead of dropping them.
export const FOOT_WIDTH=25;
// Below ROCK_Y the ground is rock: craters only dig ROCK_SOFTNESS of their depth into it.
export const ROCK_Y=540, ROCK_SOFTNESS=0.4;
// angles: [min,max] elevation above horizontal the weapon can aim at, mirrored for left shots.
export const DEFAULT_AMMO={gravityScale:1,windScale:1,craterWidth:48,craterDepth:48,damageMax:42,damageRadius:95,angles:[10,80]};
export const MAX_TILT=20, MAX_CLIMB=45, CLIMB_COST=2, ENERGY=100;
// Ground slope under x in degrees; positive when the ground rises to the right.
export function groundSlope(terrain,x){const i=Math.round(x),l=terrain[Math.max(0,i-6)],r=terrain[Math.min(WIDTH-1,i+6)];return Math.atan2(l-r,12)*180/Math.PI;}
// Body tilt: actors stand perpendicular to the slope, capped so aim stays readable.
export function slopeAngle(terrain,x){return Math.max(-MAX_TILT,Math.min(MAX_TILT,groundSlope(terrain,x)));}
// Energy per pixel walked in direction dir (+1 right): 1 on flat or downhill, more uphill, Infinity when too steep to climb.
export function moveCost(terrain,x,dir){const up=groundSlope(terrain,x)*dir;if(up>MAX_CLIMB)return Infinity;return 1+CLIMB_COST*Math.max(0,Math.tan(up*Math.PI/180));}
// Aim plus tilt, kept on the aimed side so a slope never turns a right shot into a left one.
export function launchAngle(aim,tilt){const a=aim+tilt;return aim<=90?Math.min(89,a):Math.max(91,a);}
// Slider angle (10..170, 90 straight up) clamped to the weapon's elevation range on its own side.
export function clampAngle(angle,[lo,hi]){const e=Math.min(hi,Math.max(lo,angle<=90?angle:180-angle));return angle<=90?e:180-e;}
// Aim slider value after a change: clamped to [lo,180-lo]; the dead zone (hi,180-hi) jumps to the far edge in the direction of travel, which is how direction flips.
export function settleAim(v,last,[lo,hi]){v=Math.max(lo,Math.min(180-lo,v));if(v>hi&&v<180-hi)v=v>last?180-hi:v<last?hi:v-hi<180-hi-v?hi:180-hi;return v;}
// Bot search density and aim noise per difficulty.
export const DEFAULT_SKILL={angleJitter:3,powerJitter:5,angleStep:3,powerStep:2};
// Original Sky Islands heightmap. Additional arena profiles live in maps.js.
export function makeTerrain(){return Array.from({length:WIDTH},(_,x)=>440+24*Math.sin(x/140)+12*Math.sin(x/57));}
export function launch(actor,angle,power,ammo=DEFAULT_AMMO){const r=angle*Math.PI/180,s=160+power*6;return{x:actor.x+Math.cos(r)*30,y:actor.y-30-Math.sin(r)*30,vx:Math.cos(r)*s,vy:-Math.sin(r)*s,age:0,ammo};}
export function step(p,wind,dt=DT){p.vx+=wind*p.ammo.windScale*dt;p.vy+=GRAVITY*p.ammo.gravityScale*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.age+=dt;return p;}
export function collides(p,terrain){return p.x>=0&&p.x<WIDTH&&p.y>=terrain[Math.floor(p.x)];}
// Half-ellipse hole: rx is the half width, ry the depth at the impact point.
export function crater(terrain,x,y,rx=48,ry=rx){for(let i=Math.max(0,Math.floor(x-rx));i<Math.min(WIDTH,x+rx);i++){const bottom=y+ry*Math.sqrt(Math.max(0,1-((i-x)/rx)**2)),rock=Math.max(0,bottom-ROCK_Y)*ROCK_SOFTNESS;terrain[i]=Math.max(terrain[i],Math.min(bottom,ROCK_Y)+rock);}}
export function fallDamage(drop){return drop>40?Math.round(drop/4):0;}
// The ground a stance-width actor actually rests on: the highest point under their feet, not just the center pixel.
export function groundUnderFootprint(terrain,x,half=FOOT_WIDTH){let floor=Infinity;for(let i=Math.max(0,Math.floor(x-half));i<=Math.min(WIDTH-1,Math.floor(x+half));i++)floor=Math.min(floor,terrain[i]);return floor;}
export function damage(actor,x,y,ammo=DEFAULT_AMMO){const d=Math.hypot(actor.x-x,actor.y-BODY_OFFSET-y),t=Math.max(0,d-HIT_RADIUS)/(ammo.damageRadius-HIT_RADIUS);return Math.round(Math.max(0,ammo.damageMax*(1-t)));}
// Stops at terrain, off-screen, or when passing within HIT_RADIUS of target's body center (a direct hit).
export function simulate(actor,angle,power,wind,terrain,ammo=DEFAULT_AMMO,target=null){let p=launch(actor,angle,power,ammo);for(let i=0;i<1800;i++){step(p,wind);if(collides(p,terrain)||p.x<0||p.x>=WIDTH||p.y>HEIGHT)return p;if(target&&Math.hypot(p.x-target.x,p.y-(target.y-BODY_OFFSET))<HIT_RADIUS)return p;}return p;}
// Returns the aim angle before tilt; the caller adds the same tilt when launching.
export function botShot(actor,target,wind,terrain,random=Math.random,ammo=DEFAULT_AMMO,tilt=0,skill=DEFAULT_SKILL){const[lo,hi]=ammo.angles;let best={error:Infinity,angle:180-lo,power:60};for(let e=lo;e<=hi;e+=skill.angleStep)for(const angle of[e,180-e])for(let power=15;power<=100;power+=skill.powerStep){const p=simulate(actor,launchAngle(angle,tilt),power,wind,terrain,ammo,target),error=Math.hypot(p.x-target.x,p.y-(target.y-BODY_OFFSET));if(error<best.error)best={error,angle,power};}return{angle:clampAngle(best.angle+(random()-.5)*skill.angleJitter,ammo.angles),power:Math.max(1,Math.min(100,best.power+(random()-.5)*skill.powerJitter))};}
