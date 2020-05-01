# OneDrive-Index
一个使用Cloudflare Worker的OneDrive列表程序

演示地址: [xp-play.top/drive](https://xp-play.top/drive)

## 特色
 - 前后端分离，这样就不用把域名绑定在Cloudflare
 - 使用Worker，这意味不需要服务器

## 如何使用
你需要: 
 - 一个OneDrive/SharePoint账号
 - 一个Cloudflare账号
 - 一个静态空间用于放前端(Github Pages就行)

### 1.获取refresh token等
本程序需要`refresh_token` `client_id` `client_secret` `redirect_uri`
看[Microsoft Graph Tool](https://xp-play.top/tool/microsoft-graph-api.html)

### 2.部署Worker
下载`index.js`并将`refresh_token` `client_id` `client_secret` `redirect_uri`填入第一行`config`中  
部署在Cloudflare Worker上

### 3.部署前端
下载`index.html`并修改第17行的`remote`为你Worker的地址  
部署在`Github Pages`这样的静态空间上

## 已知问题
 - 当访问量大的时候，refresh token/access token可能会失效，原因/解决方法未知

欢迎Pull Requests/Issues  
(啊啊，第一次发这种东西qwq)