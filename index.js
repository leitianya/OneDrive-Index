const config = {
    /*验证信息*/
    "refresh_token": "",
    "client_id": "",
    "client_secret": "",
    "redirect_uri": "",
    /*索引起始目录 比如/share 根目录留空*/
    "base": "",
    /*显示HEAD.md和README.md*/
    "information": true,
    /*使用Cloudflare代理文件，URL?proxied*/
    "proxyDownload": true,
}
addEventListener("fetch", event => {
    event.respondWith(handleRequest(event.request))
})
async function handleRequest(request) {
    let pathname = request.url.replace(new URL(request.url).origin, "");
    let resp = await onedrive(pathname);
    if (resp.type === "RedirectDownload") {
        return new Response(null, {
            "status": 302,
            "headers": {
                "Location": resp.result
            }
        })
    } else if (resp.type === "ProxiedDownload") {
        return new Response(resp.result[0], {
            "status": resp.result[1].status,
            "headers": {
                ...resp.result[1].headers
            }
        })
    } else {
        let value = {
            "status": resp.status,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json; charset=utf-8"
            }
        }
        /*缓存文件夹信息*/
        if (resp.type === "FolderInfo") {
            value.headers["Cache-Control"] = "max-age=21600";
        }
        return new Response(JSON.stringify(resp), value);
    }
}
async function onedrive(pathname) {
    let _accessToken = null;
    /*获取AccessToken*/
    async function getAccessToken() {
        if (_accessToken) return _accessToken;
        resp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
            method: "POST",
            body: `client_id=${config.client_id}&redirect_uri=${config.redirect_uri}&client_secret=${config.client_secret}
        &refresh_token=${config.refresh_token}&grant_type=refresh_token`,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        });
        if (resp.ok) {
            console.info("access_token refresh success.")
            const data = await resp.json()
            _accessToken = data.access_token
            return _accessToken;
        } else throw `getAccessToken error ${ JSON.stringify(await resp.text())}`
    }
    /*代理下载*/
    async function proxyDownload(downloadUrl) {
        let remoteResp = await fetch(downloadUrl);
        let {
            readable,
            writable
        } = new TransformStream();
        remoteResp.body.pipeTo(writable);
        return [readable, remoteResp];
    }
    async function graphapi(pathname) {
        let accessToken = await getAccessToken();
        let base = config.base;
        let url = `https://graph.microsoft.com/v1.0/me/drive/root${base + pathname === "/" ? "" : ":" + base + pathname}?select=name,eTag,size,id,folder,file,lastModifiedDateTime,%40microsoft.graph.downloadUrl&expand=children(select%3Dname,eTag,size,id,folder,file,lastModifiedDateTime)`;
        let resp = await fetch(url, {
            headers: {
                "Authorization": `bearer ${accessToken}`
            }
        });
        return resp;
    }
    async function Indexer(pathname) {
        let {searchParams} = new URL("http://127.0.0.1"+pathname);
    
        let data = await graphapi(pathname);
        let error = null;
        if (data.ok) {
            data = await data.json();
            console.log(data);
            if ("file" in data) {
                if (searchParams.get("download") !== null) {
                    return {"status":302,"type":"RedirectDownload","result":data["@microsoft.graph.downloadUrl"]};
                } else if (searchParams.get("proxied") !== null) {
                    return {"status":200,"type":"ProxiedDownload","result":await proxyDownload(data["@microsoft.graph.downloadUrl"])};
                } else {
                    return {"status":200,"type":"FileInfo","result":renderData(data)};
                }
            } else if ("folder" in data) {
                let folder = {"status":200,"type":"FolderInfo","result":renderData(data,config.information)};
                if (!pathname.endsWith("/")) { pathname += "/" };
                if (config.information) {
                    let head, readme;
                    for (let e of data.children) {
                        if (head && readme) { break };
                        if (e.name === "HEAD.md") {
                            head = await getMore(e.name);
                        } else if (e.name === "README.md") {
                            readme = await getMore(e.name);
                        }
                        async function getMore(name) {
                            let data = await graphapi(pathname + name);
                            console.log(`fetch ${pathname + name}`)
                            if (data.ok) {
                                data = await data.json();
                                console.log(data)
                                data = await fetch(data["@microsoft.graph.downloadUrl"]);
                                if (data.ok) {
                                    return data.text();
                                }
                            }
                        }
                    }
                    if (head || readme) {
                        folder.information = [head, readme];
                    }
                }
                return folder;
            } else {
                error = data;
            }
        } else {
            error = await data.json();
        }

        if (error) {
            console.log("Error: %o", error);
            if (error.error.code === "itemNotFound") {
                return {"status":404,"type":"NotFound","message":"未找到物品"};
            } else {
                return {"status":500,"type":"ServerError","message":"500 服务器错误","error":error};
            }
        }
    }
    function renderData(data, information = false) {
        function toHumanFileSize(bytes, si) {
            bytes = parseInt(bytes, 10)
            var thresh = si ? 1000 : 1024;
            if (Math.abs(bytes) < thresh) {
                return bytes + " B";
            }
            var units = si
                ? ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
                : ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
            var u = -1;
            do {
                bytes /= thresh;
                ++u;
            } while (Math.abs(bytes) >= thresh && u < units.length - 1);
            return bytes.toFixed(1) + " " + units[u];
        }
        /*新手，写的渣见谅*/
        function dateFormat(date, format) {
            var o = {
                "M+": date.getMonth() + 1,
                "d+": date.getDate(),
                "h+": date.getHours(),
                "m+": date.getMinutes(),
                "s+": date.getSeconds(),
                "q+": Math.floor((date.getMonth() + 3) / 3),
                "S": date.getMilliseconds()
            };
            if (/(y+)/.test(format)) {
                format = format.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
            }
            for (var k in o) {
                if (new RegExp(`(${k})`).test(format)) {
                    format = format.replace(RegExp.$1, RegExp.$1.length == 1 ? o[k] : ("00" + o[k]).substr(("" + o[k]).length));
                }
            }
            return format
        }
        function toNormalDate(date) {
            date = date.split("T");
            date[1] = date[1].split("Z")[0];
            let parts = date[0].split("-");

            let year = parts[0];
            /* new Date() 需要 -1*/
            let mouth = Number(parts[1]) - 1;
            let day = parts[2];

            parts = date[1].split(":");

            /*这个好像叫DateTimeOffset，要加8小时来着*/
            let hour = Number(parts[0]) + 8;
            let min = parts[1];
            let sec = parts[2];

            return dateFormat(new Date(year, mouth, day, hour, min, sec), "yyyy-MM-dd hh:mm:ss");
        }
        let render = {
            "name": data.name,
            "size": data.size,
            "humanSize": toHumanFileSize(data.size),
            "time": toNormalDate(data.lastModifiedDateTime)
        };
        if ("folder" in data) {
            render.folder = [];
            data.children.forEach(e => {
                if (information && "file" in e && (e.name === "README.md" || e.name === "HEAD.md")) {
                    return;
                }
                let item = {
                    "name": e.name,
                    "size": e.size,
                    "humanSize": toHumanFileSize(e.size),
                    "time": toNormalDate(e.lastModifiedDateTime)
                }
                if ("folder" in e) {
                    item.folder = {
                        "count": e.folder.childCount
                    }
                } else if ("file" in e) {
                    item.file = {
                        "mineType": e.file.mineType,
                    }
                    if (e.file.hashes && e.file.hashes.quickXorHash) {
                        item.file.hash = e.file.hashes.quickXorHash
                    }
                }
                render.folder.push(item);
            })
        } else if ("file" in data) {
            render.file = {
                "mineType": data.file.mineType,
                "url": data["@microsoft.graph.downloadUrl"]
            };
            if (data.file.hashes.quickXorHash) {
                render.file.hash = data.file.hashes.quickXorHash;
            }
        }
        return render;
    };
    return Indexer(pathname);
}