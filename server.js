const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const POSTS_FILE = path.join(DATA_DIR, "forum-posts.json");
const USERS_FILE = path.join(DATA_DIR, "forum-users.json");
const OFFICIAL_NEWS_URL = "https://www.beijingacademy.com.cn/cms/bjzx/zxdt1/index.jhtml";

const mimeTypes = {
  ".html":"text/html; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".png":"image/png",
  ".svg":"image/svg+xml; charset=utf-8"
};

const defaultPosts = [
  {
    id:"demo-1",
    author:"北中观察员",
    title:"论坛栏目更新建议征集",
    content:"欢迎围绕校园导览、社团展示、学习经验和活动记录提出建议。[思考]",
    category:"suggestions",
    likes:6,
    likedBy:[],
    favoritedBy:[],
    reports:0,
    reportedBy:[],
    createdAt:"2026-09-18 18:20",
    replies:[
      {id:"reply-demo-1", author:"同学A", content:"社团展示可以补充每个社团的招新说明。[点赞]", createdAt:"2026-09-18 18:31"},
      {id:"reply-demo-2", author:"同学B", content:"校园导览也很重要，新同学会用得上。", createdAt:"2026-09-18 18:42"}
    ]
  },
  {
    id:"demo-2",
    author:"课程记录小组",
    title:"项目学习成果可以怎么展示？",
    content:"项目成果可采用网页、海报、地图、访谈整理或短视频脚本等形式。关键是写清楚资料来源和修改过程。[星星眼]",
    category:"study",
    likes:4,
    likedBy:[],
    favoritedBy:[],
    reports:0,
    reportedBy:[],
    createdAt:"2026-09-18 19:05",
    replies:[]
  }
];

const baseSensitiveWords = [
  "傻子","傻逼","傻比","沙比","沙逼","煞笔","傻叉","蠢货","白痴","智障","垃圾人","滚蛋","滚开","去死","死全家","废物","脑残","弱智",
  "sb","s逼","s比","shabi","sha bi","傻b","傻 b","沙b","沙 b","煞b","煞 b","nt","nmsl","尼玛","你妈","他妈","tm","tmd",
  "我草","我操","卧槽","卧草","窝草","握草","雾草","wocao","wo cao","woc","wc","艹你","草你","操你",
  "打架","约架","群殴","霸凌","欺凌","网暴","人身攻击","威胁","恐吓","报复","砍人","杀人","炸学校","放火","自残","自杀",
  "色情","黄图","黄色网站","裸照","裸聊","约炮","赌博","博彩","赌球","毒品","吸毒","贩毒","迷药",
  "骚逼","骚比","骚b","小骚逼","小骚比","小骚b","贱逼","贱比","贱b","淫荡","淫秽","下流话","性骚扰",
  "作弊","代考","卖答案","买答案","答案群","泄题","枪手代写","代写作业","代写论文","考试答案",
  "人肉","开盒","盒武器","身份证号","手机号泄露","家庭住址","偷拍视频","偷拍","隐私照",
  "冒充官方","假通知","假公告","谣言","造谣","钓鱼链接","诈骗","刷单","贷款","网赌","网贷"
];

const moderationParts = {
  insultHeads:["傻","沙","煞"],
  insultTails:["逼","比","b","笔","叉","批"],
  sexualHeads:["骚","浪","淫","贱","小骚"],
  sexualTails:["逼","比","b","货"],
  vulgarHeads:["我","你","他","她","它","草","操","艹","卧","窝","握","雾"],
  vulgarTails:["草","操","槽","艹","你","妈","爹","全家","大爷"],
  riskHeads:["打","约","群","网","恐","威","报","砍","杀","炸","烧","偷拍","偷录","开盒","人肉"],
  riskTails:["架","殴","暴","吓","胁","复","人","学校","教室","同学","老师","隐私","住址"],
  cheatHeads:["买","卖","求","发","泄","偷","代","替","帮"],
  cheatTails:["答案","考","写","题","作业","论文","试卷","成绩","分数"],
  scamHeads:["钓鱼","诈骗","刷单","网贷","网赌","博彩","赌博","赌球","贷款"],
  scamTails:["链接","群","网站","二维码","账号","平台","广告"]
};

const sensitivePatterns = [
  {label:"辱骂缩写", pattern:/s\s*\.?\s*b/i},
  {label:"辱骂拼音", pattern:/sha\s*bi|sha\s*bei|shabi|shabei/i},
  {label:"不文明用语", pattern:/wo\s*cao|w\s*o\s*c|w\s*c|卧\s*[槽草]|我\s*[草操]|窝\s*草|雾\s*草/i},
  {label:"人身攻击", pattern:/傻\s*[子逼比b]|沙\s*[逼比b]|煞\s*[笔b]|脑\s*残|弱\s*智|智\s*障/i},
  {label:"严重性羞辱", pattern:/小?\s*[骚浪淫贱]\s*[逼比b货]|性\s*骚\s*扰|下\s*流\s*话/i},
  {label:"开盒人肉", pattern:/开\s*盒|人\s*肉|盒\s*武\s*器|身\s*份\s*证|家\s*庭\s*住\s*址/i},
  {label:"考试作弊", pattern:/卖\s*答\s*案|买\s*答\s*案|代\s*考|泄\s*题|作\s*弊/i}
];

function ensureDataFile(){
  fs.mkdirSync(DATA_DIR, {recursive:true});
  if (!fs.existsSync(POSTS_FILE)) {
    fs.writeFileSync(POSTS_FILE, JSON.stringify(defaultPosts, null, 2));
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
  }
}

function readPosts(){
  ensureDataFile();
  try {
    const posts = JSON.parse(fs.readFileSync(POSTS_FILE, "utf8"));
    return normalizePosts(Array.isArray(posts) && posts.length ? posts : defaultPosts);
  } catch {
    return normalizePosts(defaultPosts);
  }
}

function savePosts(posts){
  ensureDataFile();
  const normalized = normalizePosts(posts);
  fs.writeFileSync(POSTS_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
}

function readUsers(){
  ensureDataFile();
  try {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

function saveUsers(users){
  ensureDataFile();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  return users;
}

function normalizeUsername(value){
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_").slice(0, 24);
}

function hashPassword(value){
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizePosts(posts){
  return posts.map(post => {
    const reportedBy = Array.isArray(post.reportedBy) ? post.reportedBy : [];
    const legacyLikeCount = Number(post.likes) || 0;
    const likedBy = Array.isArray(post.likedBy) && post.likedBy.length
      ? post.likedBy
      : Array.from({length:legacyLikeCount}, (_, index) => `legacy-like-${post.id}-${index}`);
    const favoritedBy = Array.isArray(post.favoritedBy) ? post.favoritedBy : [];
    return {
      id:post.id || createId("post"),
      author:String(post.author || "匿名同学").slice(0, 24),
      title:String(post.title || "无标题").slice(0, 48),
      content:String(post.content || "").slice(0, 800),
      category:String(post.category || "campus").slice(0, 24),
      ownerId:String(post.ownerId || ""),
      likedBy,
      likes:likedBy.length,
      favoritedBy,
      favorites:favoritedBy.length,
      reports:reportedBy.length,
      reportedBy,
      createdAt:post.createdAt || nowLabel(),
      replies:Array.isArray(post.replies) ? post.replies.map((reply, index) => ({
        id:reply.id || `reply-${post.id || "post"}-${index}`,
        author:String(reply.author || "匿名同学").slice(0, 24),
        content:String(reply.content || "").slice(0, 500),
        createdAt:reply.createdAt || nowLabel()
      })) : []
    };
  });
}

function createId(prefix){
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowLabel(){
  const date = new Date();
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function expandSensitiveWords(words){
  const separators = [" ",".","-","_","*","·"];
  const expanded = new Set(words);
  words.forEach(word => {
    const chars = Array.from(word);
    separators.forEach(separator => {
      if (chars.length > 1) expanded.add(chars.join(separator));
    });
  });
  Object.entries(moderationParts).forEach(([key, values]) => {
    if (!key.endsWith("Heads")) return;
    const tails = moderationParts[key.replace("Heads", "Tails")] || [];
    values.forEach(head => {
      tails.forEach(tail => {
        expanded.add(`${head}${tail}`);
        expanded.add(`${head} ${tail}`);
        expanded.add(`${head}.${tail}`);
        expanded.add(`${head}-${tail}`);
      });
    });
  });
  return Array.from(expanded);
}

const expandedSensitiveWords = expandSensitiveWords(baseSensitiveWords);

function normalizeForModeration(value){
  return String(value)
    .toLowerCase()
    .replace(/[\s\u200b\u200c\u200d\ufe0f_\-—=+*/\\|,.!?，。！？、:：;；"'“”‘’()[\]{}<>《》【】~·`^#$%@]+/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "死")
    .replace(/5/g, "我");
}

function findSensitiveWord(...values){
  const original = values.join(" ");
  const normalized = normalizeForModeration(original);
  const wordHit = expandedSensitiveWords.find(word => normalized.includes(normalizeForModeration(word)));
  if (wordHit) return wordHit;
  const patternHit = sensitivePatterns.find(item => item.pattern.test(original) || item.pattern.test(normalized));
  return patternHit ? patternHit.label : "";
}

function sendJson(res, status, data){
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8"});
  res.end(JSON.stringify(data));
}

function readBody(req){
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function absolutize(url){
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url, OFFICIAL_NEWS_URL).toString();
}

function stripHtml(value){
  return String(value).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

async function fetchOfficialNews(limit = 10){
  const response = await fetch(OFFICIAL_NEWS_URL);
  if (!response.ok) throw new Error(`official news failed: ${response.status}`);
  const html = await response.text();
  const items = [];
  const pattern = /<ul>\s*<li class="fir">\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/li>\s*<li class="sec">\[([^\]]+)\]<\/li>\s*<\/ul>/gi;
  let match;
  while ((match = pattern.exec(html)) && items.length < limit) {
    items.push({
      title:stripHtml(match[2]),
      date:match[3],
      url:absolutize(match[1])
    });
  }
  return items;
}

async function handleApi(req, res, url){
  if (url.pathname === "/api/news/official" && req.method === "GET") {
    const limit = Math.max(1, Math.min(20, Number(url.searchParams.get("limit")) || 10));
    const items = await fetchOfficialNews(limit);
    return sendJson(res, 200, {source:OFFICIAL_NEWS_URL, fetchedAt:new Date().toISOString(), items});
  }

  if (url.pathname === "/api/forum/auth/login" && req.method === "POST") {
    const body = await readBody(req);
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");
    const displayName = String(body.displayName || body.username || "论坛用户").trim().slice(0, 24);
    if (!username || password.length < 3) {
      return sendJson(res, 400, {error:"invalid_login", message:"用户名不能为空，密码至少 3 位。"});
    }
    const users = readUsers();
    const passwordHash = hashPassword(password);
    let user = users.find(item => item.username === username);
    if (user && user.passwordHash !== passwordHash) {
      return sendJson(res, 403, {error:"wrong_password", message:"密码不正确。"});
    }
    if (!user) {
      user = {id:`user-${username}`, username, displayName, passwordHash, createdAt:nowLabel()};
      users.push(user);
      saveUsers(users);
    } else if (displayName && user.displayName !== displayName) {
      user.displayName = displayName;
      saveUsers(users);
    }
    return sendJson(res, 200, {user:{id:user.id, username:user.username, displayName:user.displayName}});
  }

  if (url.pathname === "/api/forum/posts" && req.method === "GET") {
    return sendJson(res, 200, {posts:readPosts()});
  }
  if (url.pathname === "/api/forum/posts" && req.method === "PUT") {
    const body = await readBody(req);
    return sendJson(res, 200, {posts:savePosts(Array.isArray(body) ? body : body.posts || [])});
  }
  if (url.pathname === "/api/forum/posts" && req.method === "POST") {
    const body = await readBody(req);
    const blocked = findSensitiveWord(body.author, body.title, body.content);
    if (blocked) return sendJson(res, 400, {error:"sensitive_word", word:blocked});
    const posts = readPosts();
    posts.unshift({
      id:createId("post"),
      author:body.author || "匿名同学",
      title:body.title || "无标题",
      content:body.content || "",
      category:body.category || "campus",
      ownerId:body.userId || "",
      likes:0,
      likedBy:[],
      favoritedBy:[],
      reportedBy:[],
      reports:0,
      createdAt:nowLabel(),
      replies:[]
    });
    return sendJson(res, 200, {posts:savePosts(posts)});
  }

  const favoriteMatch = url.pathname.match(/^\/api\/forum\/posts\/([^/]+)\/favorite$/);
  if (favoriteMatch && req.method === "POST") {
    const body = await readBody(req);
    const userId = body.userId || `guest-${req.socket.remoteAddress || "local"}`;
    const posts = readPosts().map(post => {
      if (post.id !== decodeURIComponent(favoriteMatch[1])) return post;
      const favoritedBy = post.favoritedBy.includes(userId)
        ? post.favoritedBy.filter(id => id !== userId)
        : [...post.favoritedBy, userId];
      return {...post, favoritedBy, favorites:favoritedBy.length};
    });
    return sendJson(res, 200, {posts:savePosts(posts)});
  }

  const likeMatch = url.pathname.match(/^\/api\/forum\/posts\/([^/]+)\/like$/);
  if (likeMatch && req.method === "POST") {
    const body = await readBody(req);
    const userId = body.userId || `guest-${req.socket.remoteAddress || "local"}`;
    const posts = readPosts().map(post => {
      if (post.id !== decodeURIComponent(likeMatch[1])) return post;
      const likedBy = post.likedBy.includes(userId)
        ? post.likedBy.filter(id => id !== userId)
        : [...post.likedBy, userId];
      return {...post, likedBy, likes:likedBy.length};
    });
    return sendJson(res, 200, {posts:savePosts(posts)});
  }

  const reportMatch = url.pathname.match(/^\/api\/forum\/posts\/([^/]+)\/report$/);
  if (reportMatch && req.method === "POST") {
    const body = await readBody(req);
    const userId = body.userId || `guest-${req.socket.remoteAddress || "local"}`;
    const postId = decodeURIComponent(reportMatch[1]);
    let posts = readPosts().map(post => {
      if (post.id !== postId || post.reportedBy.includes(userId)) return post;
      const reportedBy = [...post.reportedBy, userId];
      return {...post, reportedBy, reports:reportedBy.length};
    });
    posts = posts.filter(post => post.id !== postId || post.reportedBy.length <= 5);
    return sendJson(res, 200, {posts:savePosts(posts)});
  }

  const replyMatch = url.pathname.match(/^\/api\/forum\/posts\/([^/]+)\/replies$/);
  if (replyMatch && req.method === "POST") {
    const body = await readBody(req);
    const blocked = findSensitiveWord(body.author, body.content);
    if (blocked) return sendJson(res, 400, {error:"sensitive_word", word:blocked});
    const postId = decodeURIComponent(replyMatch[1]);
    const reply = {id:createId("reply"), author:body.author || "匿名同学", content:body.content || "", createdAt:nowLabel()};
    const posts = readPosts().map(post => post.id === postId ? {...post, replies:[...post.replies, reply]} : post);
    return sendJson(res, 200, {posts:savePosts(posts)});
  }

  const deleteReplyMatch = url.pathname.match(/^\/api\/forum\/posts\/([^/]+)\/replies\/([^/]+)$/);
  if (deleteReplyMatch && req.method === "DELETE") {
    const postId = decodeURIComponent(deleteReplyMatch[1]);
    const replyId = decodeURIComponent(deleteReplyMatch[2]);
    const posts = readPosts().map(post => post.id === postId ? {...post, replies:post.replies.filter(reply => reply.id !== replyId)} : post);
    return sendJson(res, 200, {posts:savePosts(posts)});
  }

  const deletePostMatch = url.pathname.match(/^\/api\/forum\/posts\/([^/]+)$/);
  if (deletePostMatch && req.method === "DELETE") {
    const body = await readBody(req);
    const postId = decodeURIComponent(deletePostMatch[1]);
    const posts = readPosts();
    const post = posts.find(item => item.id === postId);
    if (!post) return sendJson(res, 404, {error:"post_not_found"});
    const canDelete = body.adminToken === "local-demo-admin-token" || (post.ownerId && post.ownerId === body.userId);
    if (!canDelete) return sendJson(res, 403, {error:"not_post_owner"});
    return sendJson(res, 200, {posts:savePosts(posts.filter(item => item.id !== postId))});
  }

  const clearReportsMatch = url.pathname.match(/^\/api\/forum\/posts\/([^/]+)\/reports$/);
  if (clearReportsMatch && req.method === "DELETE") {
    const postId = decodeURIComponent(clearReportsMatch[1]);
    const posts = readPosts().map(post => post.id === postId ? {...post, reportedBy:[], reports:0} : post);
    return sendJson(res, 200, {posts:savePosts(posts)});
  }

  if (url.pathname === "/api/forum/reports" && req.method === "GET") {
    const reports = readPosts().filter(post => post.reportedBy.length).map(post => ({
      postId:post.id,
      title:post.title,
      reports:post.reportedBy.length,
      reportedBy:post.reportedBy
    }));
    return sendJson(res, 200, {reports});
  }
  if (url.pathname === "/api/forum/reports" && req.method === "DELETE") {
    const posts = readPosts().map(post => ({...post, reportedBy:[], reports:0}));
    return sendJson(res, 200, {posts:savePosts(posts)});
  }
  if (url.pathname === "/api/forum/demo" && req.method === "POST") {
    return sendJson(res, 200, {posts:savePosts(defaultPosts)});
  }
  if (url.pathname === "/api/forum/moderation/sensitive-words" && req.method === "GET") {
    return sendJson(res, 200, {count:expandedSensitiveWords.length, words:expandedSensitiveWords});
  }
  if (url.pathname === "/api/forum/moderation/sensitive-words" && req.method === "PUT") {
    const body = await readBody(req);
    return sendJson(res, 200, {message:"当前演示后端不持久化修改敏感词，请直接修改 server.js 和 portal.html。", received:Array.isArray(body.words) ? body.words.length : 0});
  }
  if (url.pathname === "/api/forum/uploads" && req.method === "POST") {
    return sendJson(res, 503, {error:"upload_unavailable", message:"图片服务暂时不可用，请稍后再试。"});
  }
  if (url.pathname === "/api/forum/admin/login" && req.method === "POST") {
    return sendJson(res, 200, {token:"local-demo-admin-token", role:"admin"});
  }

  return sendJson(res, 404, {error:"api_not_found"});
}

function serveStatic(req, res, url){
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, {"Content-Type":mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"});
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url);
    }
    return serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, {error:"server_error", message:error.message});
  }
});

server.listen(PORT, () => {
  ensureDataFile();
  console.log(`北中观察站本地服务器已启动：http://localhost:${PORT}`);
});
