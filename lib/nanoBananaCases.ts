export interface NanoBananaCase {
  id: string;
  title: string;
  sourceUrl: string;
  imageUrl: string;
  prompt: string;
  mode: 'text2img' | 'img2img';
  category: 'design' | 'analysis' | 'visual' | 'story';
}

// Cases sourced from https://github.com/ROOOU/Awesome-Nano-Banana-images
export const NANO_BANANA_CASES: NanoBananaCase[] = [
  {
    id: 'pro-2',
    title: '生成对应坐标的图片',
    sourceUrl: 'https://x.com/TechieBySA/status/1992947742948442516?s=20',
    imageUrl: 'https://cdn.jsdelivr.net/gh/ROOOU/Awesome-Nano-Banana-images@main/images/pro_case2/output.jpg',
    prompt: '创建一张在北纬 40.7128°、西经 74.0060° 处，于 2001 年 9 月 11 日 08:46 的图像',
    mode: 'text2img',
    category: 'story',
  },
  {
    id: 'pro-4',
    title: '根据文档生成流程图',
    sourceUrl: 'https://x.com/anderssandberg/status/1992259420118724677?s=20',
    imageUrl: 'https://cdn.jsdelivr.net/gh/ROOOU/Awesome-Nano-Banana-images@main/images/pro_case4/output.jpg',
    prompt: '图示为根据论文 Armstrong, S., & Sandberg, A. (2013). Eternity in six hours: Intergalactic spreading of intelligent life and sharpening the Fermi paradox. Acta Astronautica, 89, 1-13 构建戴森群的过程。',
    mode: 'text2img',
    category: 'analysis',
  },
  {
    id: 'pro-7',
    title: '物品制作幕后',
    sourceUrl: 'https://x.com/ZHO_ZHO_ZHO/status/1992607074199777522?s=20',
    imageUrl: 'https://cdn.jsdelivr.net/gh/ROOOU/Awesome-Nano-Banana-images@main/images/pro_case7/case.jpg',
    prompt: '我想看这个是如何制作出来的',
    mode: 'img2img',
    category: 'analysis',
  },
  {
    id: 'pro-9',
    title: '生成材质贴图',
    sourceUrl: 'https://x.com/someidesign/status/1992633404186316906?s=20',
    imageUrl: 'https://cdn.jsdelivr.net/gh/ROOOU/Awesome-Nano-Banana-images@main/images/pro_case9/case.jpg',
    prompt: '您能否帮我使用这座建筑的纹理生成一个装饰图集？',
    mode: 'img2img',
    category: 'design',
  },
  {
    id: 'pro-10',
    title: '为城市图添加巨大生物',
    sourceUrl: 'https://x.com/AI_GIRL_DESIGN/status/1993244246225392089?s=20',
    imageUrl: 'https://cdn.jsdelivr.net/gh/ROOOU/Awesome-Nano-Banana-images@main/images/pro_case10/output.jpg',
    prompt: '使用上传的城市照片作为底图。请勿更改照片中的真实建筑、街道、车辆或人物。保持照片的真实性。在建筑物上方和后方的天空中添加一个非常巨大、风格化的插画生物，仿佛它俯瞰着整座城市。',
    mode: 'img2img',
    category: 'visual',
  },
  {
    id: 'pro-12',
    title: '蓬松毛绒玩具',
    sourceUrl: 'https://x.com/toolfolio/status/1992847853212012705?s=20',
    imageUrl: 'https://cdn.jsdelivr.net/gh/ROOOU/Awesome-Nano-Banana-images@main/images/pro_case12/output.jpg',
    prompt: '将一个简单的扁平矢量标志转换成一个柔软蓬松的3D立体物体。使用原有颜色。该物体完全被毛发覆盖，拥有超逼真的毛发纹理和柔和的阴影。',
    mode: 'img2img',
    category: 'design',
  },
  {
    id: 'pro-19',
    title: '角色关系图',
    sourceUrl: 'https://x.com/KanaWorks_AI/status/1993223720954155229?s=20',
    imageUrl: 'https://cdn.jsdelivr.net/gh/ROOOU/Awesome-Nano-Banana-images@main/images/pro_case19/output.jpg',
    prompt: '【日式恋爱模拟游戏】角色关系图。包含角色名称、关系箭头、好感度、冲突点。【剧情喜剧风格】。共7个角色。',
    mode: 'text2img',
    category: 'story',
  },
  {
    id: 'pro-20',
    title: '少女游戏设定集',
    sourceUrl: 'https://x.com/KanaWorks_AI/status/1993489493756964978?s=20',
    imageUrl: 'https://cdn.jsdelivr.net/gh/ROOOU/Awesome-Nano-Banana-images@main/images/pro_case20/output.jpg',
    prompt: '一套用于设定少女游戏主角及配角的背景资料。',
    mode: 'text2img',
    category: 'story',
  },
];
