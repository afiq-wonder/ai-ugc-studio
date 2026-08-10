/* AI UGC Studio — Mini UGC Director v1.3
   Adaptive Minimal Prompting
   Principle: hard-lock only face identity + product identity; adapt direction to product relationship.
*/
(function(global){
'use strict';

const structures={
 'Authentic UGC review':['First Impression','Proof','Verdict','Detail Proof','Lifestyle Recommendation'],
 'Fashion showcase':['Visual Reveal','Fit Demonstration','Movement Proof','Detail Close-up','Final Look'],
 'Problem and solution':['Problem Hook','Solution Reveal','Proof','Result','Recommendation'],
 'Unboxing':['Package Hook','Reveal','First Reaction','Demonstration','Verdict'],
 'Luxury lifestyle':['Aspirational Hook','Product Experience','Craft Detail','Lifestyle Proof','Soft Recommendation'],
 'Before and after':['Before','Discovery','Application / Use','After','Recommendation']
};

function productLabel(d){return (d&&d.product)||'the product in reference image 2'}
function sellingPoints(d){return (d&&d.sellingPoints)||'the main visible product benefit'}
function detectCategory(d){
 const t=`${d.product||''} ${d.sellingPoints||''}`.toLowerCase();
 if(/shirt|dress|abaya|wear|fashion|outfit|shoe|bag|fabric|sleeve|clothing|jeans|jacket|blazer|tudung|hijab|top|pants|skirt/.test(t))return'fashion';
 if(/skin|serum|cream|beauty|makeup|cosmetic|lotion|shampoo|cleanser|lip|moistur|gel/.test(t))return'beauty';
 if(/oven|air fryer|cooker|vacuum|mop|appliance|kitchen|home|clean|storage|organizer|lamp|machine/.test(t))return'home';
 return'general';
}
function relationship(category){return category==='fashion'?'wears':category==='beauty'?'holds':category==='home'?'interacts':'uses'}

const direction={
 fashion:{
  actions:['wears the referenced product naturally and gives a relaxed first look to camera','shows the fit with a small turn and natural fabric movement','steps back slightly to show the overall silhouette while staying recognizable','briefly shows one important garment detail, then returns attention to camera','walks naturally in the outfit and ends with a relaxed recommendation'],
  cameras:['natural medium head-to-thigh creator shot','waist-up creator shot with a gentle handheld push','natural head-to-knee shot','creator-first detail shot; brief garment detail only','medium lifestyle follow shot'],
  focuses:['overall fit and silhouette','comfort and fabric movement','garment proportions in motion','one authentic product detail','complete everyday look']
 },
 beauty:{
  actions:['holds the referenced product naturally beside the face and introduces it','shows the product texture or use while keeping the face readable','uses the product naturally and explains one benefit','briefly brings the product closer to camera, then returns it to a natural position','shows the result and gives a relaxed recommendation'],
  cameras:['natural medium close-up','face-and-product handheld framing','face-and-hands creator framing','brief product detail within a creator-led shot','medium lifestyle beauty shot'],
  focuses:['product reveal','texture or application','benefit in use','recognizable product detail','result and recommendation']
 },
 home:{
  actions:['stands naturally beside the referenced product and introduces the everyday use case','interacts with the main control or function while explaining one benefit','demonstrates the product working in a believable home moment','briefly shows an important feature while remaining in the scene','shows the practical result and ends with a relaxed recommendation'],
  cameras:['medium contextual creator shot','medium interaction shot','wider demonstration shot','creator-established feature shot','natural lifestyle result shot'],
  focuses:['product and use case','main function','benefit in action','important feature','practical result']
 },
 general:{
  actions:['introduces the referenced product naturally to camera','uses or holds the product in the most natural way for its category','demonstrates one clear benefit','briefly shows one useful product detail','ends with a relaxed personal recommendation'],
  cameras:['natural medium creator shot','medium product interaction shot','contextual handheld shot','brief creator-established detail shot','medium lifestyle shot'],
  focuses:['product reveal','natural use','main benefit','important detail','recommendation']
 }
};

function dialogue(role,i,total){
 const r=String(role||'').toLowerCase();
 if(/hook|impression|reveal|before/.test(r))return'One short natural opening thought.';
 if(/proof|demonstration|use|fit|detail|experience|application/.test(r))return'Explain one benefit naturally while demonstrating it.';
 if(/verdict|result|after|recommendation|final/.test(r)||i===total-1)return'Give a brief personal verdict without sounding scripted.';
 return'Speak naturally about what is happening now.';
}
function direct(d,seed=0){
 const category=detectCategory(d),lib=direction[category],roles=structures[d.style]||structures['Authentic UGC review'],scenes=[];
 for(let i=0;i<d.scenes;i++){
  const x=(i+seed)%lib.actions.length;
  scenes.push({id:i,title:`Scene ${i+1} — ${roles[i]||'Campaign Scene'}`,purpose:roles[i]||'Campaign Scene',category,relationship:relationship(category),action:lib.actions[x],camera:lib.cameras[x],productFocus:lib.focuses[x],dialogueIntent:dialogue(roles[i],i,d.scenes)});
 }
 return scenes;
}

function identityPrompt(){return `FACE IDENTITY LOCK\nReference image 1 is the only human identity source. Keep the creator unmistakably the same person: preserve the recognizable face, facial structure and proportions, skin tone, and apparent age.\n\nDo not borrow any human identity from reference image 2.\n\nCreator styling is flexible unless it defines basic presentation. If the creator wears a hijab/head covering, keep the creator appropriately head-covered, but natural variation in color, drape, folds and styling is allowed. Clothing and accessories may vary naturally unless they are the promoted product.\n\nPriority: preserve the person, not every styling detail.`}

function productPrompt(d){return `PRODUCT LOCK\nReference image 2 is the product source. Keep ${productLabel(d)} recognizably accurate to the reference, especially its defining shape, color, proportions, visible design details and genuine product graphics.\n\nIf reference image 2 contains a person, ignore that person's identity and styling.\n\nDo not turn selling points into visible advertising text. Selling points are guidance for what the creator communicates: ${sellingPoints(d)}.`}

function adaptiveRule(scene){
 if(scene.relationship==='wears')return'APPAREL MODE: transfer the referenced garment onto the locked creator. Preserve the creator’s face identity. Let the garment fit naturally on the creator’s body. Do not copy the product-reference model.';
 if(scene.relationship==='holds')return'HANDHELD MODE: keep the creator’s face recognizable while the referenced product is naturally held or used. Product placement should support, not dominate, the creator.';
 if(scene.relationship==='interacts')return'INTERACTION MODE: keep the creator recognizable while placing the referenced product naturally in the scene at believable scale and position for real interaction.';
 return'USE MODE: preserve creator identity and product identity, then compose the simplest believable interaction.';
}

function scenePrompt(d,s){return `Use reference image 1 for the creator and reference image 2 for the product.\n\nHARD LOCKS\n- Same recognizable creator face as reference image 1.\n- Same recognizable product as reference image 2.\n- Never use a person in the product reference as the creator.\n\n${adaptiveRule(s)}\n\n${s.title}\nCreate a vertical 9:16 ${d.platform} ${d.style} scene in ${d.language}.\nLocation: ${d.location}.\nProduct: ${productLabel(d)}.\n\nAction: The creator ${s.action}.\nProduct focus: ${s.productFocus}.\nDialogue: ${s.dialogueIntent}\nCamera: ${s.camera}; keep the creator’s face visible and recognizable.\n\nKeep the selected location believable. Use selling points as dialogue/action guidance only: ${sellingPoints(d)}. Do not generate promotional signs, captions or background advertising text.\n\nAuthentic UGC: relaxed expression, natural hands and body movement, believable product physics, casual smartphone framing, subtle handheld movement. Avoid glossy studio-ad posing.\n\n6–8 seconds. Same creator and same product across the campaign.`}

function framingGuard(s){return `Adaptive camera: ${s.camera}. Keep the creator's recognizable face visible; use detail framing only briefly when needed.`}
function sceneIntegrityGuard(d){return `Use ${d.location} as the scene location. Do not convert selling points into environmental text or signage.`}
function quality(scenes){let dup=0;for(let i=0;i<scenes.length;i++)for(let j=i+1;j<scenes.length;j++)['action','camera','productFocus'].forEach(k=>{if(scenes[i][k]===scenes[j][k])dup++});const max=Math.max(1,(scenes.length*(scenes.length-1)/2)*3);return Math.max(0,Math.round(100-(dup/max)*100))}

const Director={version:'1.3.0',philosophy:'Adaptive Minimal Prompting',structures,direction,detectCategory,relationship,direct,redirect(d,s,a){return direct(d,a+1)[s.id]},quality,identityPrompt,productPrompt,framingGuard,sceneIntegrityGuard,scenePrompt,productLabel,sellingPoints};
global.AIUGCDirector=Director;
})(window);