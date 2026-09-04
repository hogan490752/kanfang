// 看房对比 · 表格展示页逻辑
(function () {
  "use strict";

  var houses = [];
  var filters = { q: "", region: "全部", metro: false, car: false, school: false };

  var COLS = [
    { key: "region", label: "地区" },
    { key: "name", label: "小区" },
    { key: "property_company", label: "小区物业" },
    { key: "property_fee", label: "物业费" },
    { key: "pc", label: "优缺点" },
    { key: "metro", label: "地铁" },
    { key: "kindergarten", label: "幼儿园" },
    { key: "primary_school", label: "小学" },
    { key: "middle_school", label: "初中" },
    { key: "car_free", label: "人车分流" },
    { key: "videos", label: "看房视频" },
    { key: "notes", label: "备注" },
    { key: "ops", label: "操作" }
  ];
  var listEl = document.getElementById("table-wrap");
  var qEl = document.getElementById("q");
  var chipsEl = document.getElementById("chips");
  var countEl = document.getElementById("count");

  function initChips() {
    var regions = [];
    houses.forEach(function (h) { if (regions.indexOf(h.region) < 0 && h.region) regions.push(h.region); });
    chipsEl.innerHTML = "";
    ["全部"].concat(regions).forEach(function (r) {
      var b = document.createElement("button");
      b.className = "chip" + (filters.region === r ? " on" : "");
      b.textContent = r === "全部" ? "全部地区" : r;
      b.addEventListener("click", function () { filters.region = r; render(); });
      chipsEl.appendChild(b);
    });
    [
      { key: "metro", label: "🚇 地铁800m内" },
      { key: "car", label: "🚗 人车分流" },
      { key: "school", label: "🏫 初中固定对口" }
    ].forEach(function (def) {
      var b = document.createElement("button");
      b.className = "chip feat" + (filters[def.key] ? " on" : "");
      b.textContent = def.label;
      b.addEventListener("click", function () { filters[def.key] = !filters[def.key]; render(); });
      chipsEl.appendChild(b);
    });
  }

  function match(h) {
    if (filters.region !== "全部" && h.region !== filters.region) return false;
    if (filters.metro && !h.metro_ok) return false;
    if (filters.car && !h.car_free) return false;
    if (filters.school && !h.middle_fixed) return false;
    if (filters.q) {
      var hay = [h.name, h.region, h.location, h.pros, h.cons, h.notes, h.primary_school, h.middle_school,
        h.kindergarten, h.property_company, h.metro].join(" ").toLowerCase();
      if (hay.indexOf(filters.q.toLowerCase()) < 0) return false;
    }
    return true;
  }

  function esc(s) { return HouseApp.esc(s); }

  function pointsUl(text, cls) {
    var pts = HouseApp.splitPoints(text);
    if (!pts.length) return '<span class="dim">—</span>';
    return '<ul class="' + cls + '">' + pts.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>";
  }

  function yn(v) {
    return v ? '<span class="yn yes">✔ 是</span>' : '<span class="yn no">✘ 否</span>';
  }

  function cellHtml(h, key) {
    switch (key) {
      case "region": return ""; // 地区列用 rowspan 单独处理
      case "name":
        return '<button class="name-link" data-detail="' + h.id + '">' + esc(h.name) + "</button>" +
          '<div class="dim">📍' + esc(h.location || "—") + " · " + (h.middle_fixed ? "初中固定对口" : "初中⚠不固定") + "</div>" +
          '<div class="dim">🏠 ' + (h.rooms && h.rooms.length ? h.rooms.length + " 套房 · " : "") +
          ((h.rooms || []).reduce(function (n, r) { return n + (r.videos || []).length; }, 0) + (h.videos || []).length) + " 个视频 · 点看详情</div>";
      case "property_company": return h.property_company ? '<div class="cell-line">' + esc(h.property_company) + "</div>" : dim();
      case "property_fee": return h.property_fee ? '<div class="cell-line" style="font-variant-numeric:tabular-nums">' + esc(h.property_fee) + "</div>" : dim();
      case "pc":
        return '<div class="points-cell-cell">' + pointsUl(h.pros, "pros") + pointsUl(h.cons, "cons") + "</div>";
      case "metro":
        return '<div class="cell-line">' + (h.metro ? esc(h.metro) : "—") + "</div>" +
          (h.metro_ok ? "" : '<div class="dim">⚠超出800m</div>');
      case "kindergarten": return h.kindergarten ? '<div class="cell-line">' + esc(h.kindergarten) + "</div>" : dim();
      case "primary_school": return h.primary_school ? '<div class="cell-line">' + esc(h.primary_school) + "</div>" : dim();
      case "middle_school": return h.middle_school ? '<div class="cell-line">' + esc(h.middle_school) + "</div>" : dim();
      case "car_free": return yn(h.car_free);
      case "videos": return videosCell(h);
      case "notes": return h.notes ? '<div class="cell-line">' + esc(h.notes) + "</div>" : dim();
      case "ops":
        return '<div class="row-ops">' +
          '<button class="icon-btn" data-edit="' + h.id + '">编辑</button>' +
          '<button class="icon-btn del" data-del="' + h.id + '">删除</button></div>';
      default: return "";
    }
    function dim() { return '<span class="dim">—</span>'; }
  }

  function videosCell(h) {
    var roomCount = (h.rooms || []).length;
    var vidCount = (h.videos || []).length + (h.rooms || []).reduce(function (n, r) { return n + (r.videos || []).length; }, 0);
    var parts = ['<div class="vmini">'];
    (h.videos || []).forEach(function (v) {   // 老数据：直挂在小区上的视频
      parts.push(
        "<div>" +
        (v.label ? '<div class="dim">' + esc(v.label) + "</div>" : "") +
        '<div class="vwrap"><video controls preload="none" playsinline src="' + v.url + '"></video>' +
        '<button class="vfs" data-fs-vid title="放大播放">⤢</button></div>' +
        '<div class="vmeta"><span>' + esc(v.orig_name) + " · " + HouseApp.fmtSize(v.size) + "</span>" +
        '<button class="del" data-del-vid="' + v.id + '">删除</button></div></div>'
      );
    });
    parts.push('<button class="vadd" data-detail="' + h.id + '">' +
      (roomCount ? "🏠 " + roomCount + " 套房 · " : "") +
      (vidCount ? "📹 " + vidCount + " 个 · 点进详情" : "＋ 传视频") + "</button></div>");
    return parts.join("");
  }

  function render() {
    initChips();
    var shown = houses.filter(match);
    var mobile = isMobile();
    countEl.textContent = "共 " + shown.length + " / " + houses.length + " 个小区";
    var toggle = document.getElementById("view-toggle");
    if (toggle) toggle.textContent = mobile ? "🖥 电脑版" : "📱 手机版";
    var hint = document.querySelector(".tool-row .hint");
    if (hint) hint.textContent = mobile
      ? "手机版：按地区分组，点小区名看详情和视频。"
      : "表格可左右/上下滑动，地区列和表头固定。点「编辑」改任意一列。";
    listEl.classList.toggle("cards-mode", mobile);
    if (!shown.length) {
      listEl.innerHTML = '<div class="empty">没有符合条件的小区，换个筛选试试。</div>';
      return;
    }
    if (mobile) renderCards(shown);
    else renderTable(shown);
  }

  /** 视图模式：auto=按屏宽自适应；pc/mobile=手动指定（记住选择） */
  var viewPref = "auto";
  try { viewPref = localStorage.getItem("house_view") || "auto"; } catch (e) {}

  /** 是否用手机端卡片样式 */
  function isMobile() {
    if (viewPref === "mobile") return true;
    if (viewPref === "pc") return false;
    return window.matchMedia("(max-width: 768px)").matches;
  }

  /** 按地区聚合：同名地区排在一起（地区顺序按首次出现），组内保持原有顺序 */
  function groupByRegion(list) {
    var order = [];
    list.forEach(function (h) {
      var r = h.region || "其他";
      if (order.indexOf(r) < 0) order.push(r);
    });
    return order.map(function (r) {
      return {
        region: r,
        items: list.filter(function (h) { return (h.region || "其他") === r; })
      };
    });
  }

  function renderTable(shown) {
    var groups = groupByRegion(shown);
    var colgroup = "<colgroup>" + COLS.map(function (c) {
      return '<col class="c-' + c.key + '">';
    }).join("") + "</colgroup>";
    var head = "<thead><tr>" + COLS.map(function (c) { return "<th>" + esc(c.label) + "</th>"; }).join("") + "</tr></thead>";
    var body = "<tbody>";
    groups.forEach(function (group) {
      group.items.forEach(function (h, idx) {
        body += "<tr>";
        COLS.forEach(function (c) {
          var cls = c.key === "pc" ? ' class="points-cell"' : (c.key === "name" ? ' class="name-cell"' : "");
          if (c.key === "region") {
            // 同一地区只在第一行渲染单元格，用 rowspan 纵向合并
            if (idx === 0) {
              body += '<td class="region-cell" rowspan="' + group.items.length + '">' + esc(group.region) + "</td>";
            }
          } else {
            body += "<td" + cls + ">" + cellHtml(h, c.key) + "</td>";
          }
        });
        body += "</tr>";
      });
    });
    body += "</tbody>";
    listEl.innerHTML = '<table class="houses">' + colgroup + head + body + "</table>";
  }

  // ---------- 手机端卡片流 ----------

  function cardHtml(h) {
    var roomCount = (h.rooms || []).length;
    var vidCount = (h.videos || []).length +
      (h.rooms || []).reduce(function (n, r) { return n + (r.videos || []).length; }, 0);

    var tags =
      (h.metro_ok ? '<span class="tag ok">🚇 地铁800m内</span>' : '<span class="tag no">🚇 地铁远</span>') +
      (h.car_free ? '<span class="tag ok">🚗 人车分流</span>' : '<span class="tag no">🚗 不分流</span>') +
      (h.middle_fixed ? '<span class="tag ok">🏫 初中固定</span>' : '<span class="tag no">🏫 初中不固定</span>') +
      (h.property_fee ? '<span class="tag fee">物业 ' + esc(h.property_fee) + "</span>" : "");

    var infos = [
      ["物业", h.property_company],
      ["地铁", h.metro],
      ["幼儿园", h.kindergarten],
      ["小学", h.primary_school],
      ["初中", h.middle_school]
    ].filter(function (p) { return p[1]; });

    // 次级信息（配套 / 优缺点 / 备注）统一收进折叠区，卡片保持短、首屏能看多张
    var moreBody = "";
    if (h.notes) moreBody += '<div class="room-notes">' + esc(h.notes) + "</div>";
    if (infos.length) {
      moreBody += '<dl class="dl">' + infos.map(function (p) {
        return "<div><dt>" + p[0] + "</dt><dd>" + esc(p[1]) + "</dd></div>";
      }).join("") + "</dl>";
    }
    if (h.pros || h.cons) {
      moreBody += '<div class="pc pros"><h4>优点</h4>' + pointsUl(h.pros, "pros") + "</div>" +
        '<div class="pc cons"><h4>缺点</h4>' + pointsUl(h.cons, "cons") + "</div>";
    }

    var cta = vidCount
      ? "▶ 看 " + vidCount + " 个看房视频" + (roomCount ? " · " + roomCount + " 套房" : "")
      : "查看详情 · 传视频";

    return '<article class="card">' +
      '<div class="card-top"><div style="min-width:0;flex:1">' +
      '<h3 class="card-name"><button class="name-link" data-detail="' + h.id + '">' + esc(h.name) + "</button></h3>" +
      (h.location ? '<p class="card-loc">📍 ' + esc(h.location) + "</p>" : "") +
      "</div></div>" +
      (tags ? '<div class="tag-row">' + tags + "</div>" : "") +
      '<div class="card-foot">' +
      '<button class="vadd" data-detail="' + h.id + '">' + cta + "</button>" +
      "</div>" +
      (moreBody ? '<details><summary>配套 · 优缺点 · 备注<span class="arr">▾</span></summary>' +
        '<div class="detail-body">' + moreBody + "</div></details>" : "") +
      '<div class="card-ops">' +
      '<button class="icon-btn" data-edit="' + h.id + '">编辑</button>' +
      '<button class="icon-btn del" data-del="' + h.id + '">删除</button>' +
      "</div>" +
      "</article>";
  }

  function renderCards(shown) {
    var groups = groupByRegion(shown);
    listEl.innerHTML = groups.map(function (g) {
      return '<div class="region-group">' +
        '<div class="region-head"><h2>' + esc(g.region) + '</h2>' +
        '<span class="cnt">' + g.items.length + ' 个</span>' +
        '<span class="rule"></span></div>' +
        '<div class="card-grid">' + g.items.map(cardHtml).join("") + "</div>" +
        "</div>";
    }).join("");
  }

  // 屏幕尺寸跨过断点时（旋转 / 拉窗口）切换布局
  var lastMobile = isMobile();
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var now = isMobile();
      if (now !== lastMobile) { lastMobile = now; render(); }
    }, 150);
  });

  // ---------- 新增 / 编辑模态 ----------

  var FIELDS = [
    { key: "region", label: "地区", type: "text", ph: "例如：光谷东及附近", req: true },
    { key: "name", label: "小区", type: "text", ph: "例如：XX新城三期", req: true },
    { key: "property_company", label: "小区物业", type: "text", ph: "例如：万科物业" },
    { key: "property_fee", label: "物业费", type: "text", ph: "例如：2.5-3元/月/㎡" },
    { key: "pros", label: "优点（一行一条）", type: "textarea", ph: "优点：…" },
    { key: "cons", label: "缺点（一行一条）", type: "textarea", ph: "缺点：…" },
    { key: "metro", label: "地铁", type: "text", ph: "例如：地铁站步行9-11分钟" },
    { key: "kindergarten", label: "幼儿园", type: "text", ph: "" },
    { key: "primary_school", label: "小学", type: "text", ph: "" },
    { key: "middle_school", label: "初中", type: "text", ph: "例如：光谷实验中学（第一梯队）" },
    { key: "location", label: "位置", type: "text", ph: "例如：三环外 东湖高新区花山" },
    { key: "notes", label: "备注", type: "textarea", ph: "" }
  ];

  function fieldHtml(f, val) {
    var v = esc(val == null ? "" : val);
    var input;
    if (f.type === "textarea") {
      input = '<textarea id="mf-' + f.key + '" placeholder="' + esc(f.ph) + '">' + v + "</textarea>";
    } else {
      input = '<input type="text" id="mf-' + f.key + '" value="' + v + '" placeholder="' + esc(f.ph) + '">';
    }
    return '<div class="field"><label for="mf-' + f.key + '">' + esc(f.label) +
      (f.req ? " *" : "") + "</label>" + input + "</div>";
  }

  function collectForm() {
    var d = {};
    FIELDS.forEach(function (f) {
      d[f.key] = document.getElementById("mf-" + f.key).value.trim();
    });
    d.metro_ok = document.getElementById("mf-metro_ok").checked;
    d.car_free = document.getElementById("mf-car_free").checked;
    d.middle_fixed = document.getElementById("mf-middle_fixed").checked;
    return d;
  }

  function openModal(h) {
    var isEdit = !!h;
    var mask = document.createElement("div");
    mask.className = "modal-mask";
    var inner = '<div class="modal"><h3>' + (isEdit ? "编辑：" + esc(h.name) : "新增小区") + "</h3>";
    inner += '<div class="grid2">';
    FIELDS.forEach(function (f) { inner += fieldHtml(f, isEdit ? h[f.key] : ""); });
    inner += "</div>";
    inner += '<div class="check-row">' +
      '<label class="check"><input type="checkbox" id="mf-metro_ok"' + (isEdit && h.metro_ok ? " checked" : "") + ">🚇 地铁800m内</label>" +
      '<label class="check"><input type="checkbox" id="mf-car_free"' + (isEdit && h.car_free ? " checked" : "") + ">🚗 人车分流</label>" +
      '<label class="check"><input type="checkbox" id="mf-middle_fixed"' + (isEdit && h.middle_fixed ? " checked" : "") + ">🏫 初中固定对口</label></div>";
    inner += '<div class="modal-ops">' +
      '<button class="btn ghost" data-mcancel>取消</button>' +
      '<button class="btn" data-msave>' + (isEdit ? "保存" : "创建") + "</button></div></div>";
    mask.innerHTML = inner;
    document.body.appendChild(mask);

    mask.querySelector("[data-msave]").addEventListener("click", function () {
      var d = collectForm();
      if (!d.name) { alert("小区名称必填"); return; }
      var url = isEdit ? "/api/houses/" + h.id : "/api/houses";
      fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "X-Site-Password": HouseApp.getPassword() },
        body: JSON.stringify(d)
      }).then(function (r) {
        return r.json().then(function (data) { return { ok: r.ok, data: data }; });
      }).then(function (res) {
        if (!res.ok) { alert(res.data.error || "保存失败"); return; }
        if (isEdit) {
          houses = houses.map(function (x) { return x.id === h.id ? Object.assign({}, x, res.data.house) : x; });
        } else {
          houses.push(Object.assign({ videos: [] }, res.data.house));
        }
        mask.remove();
        render();
      }).catch(function () { alert("网络错误"); });
    });
    mask.querySelector("[data-mcancel]").addEventListener("click", function () { mask.remove(); });
    mask.addEventListener("click", function (e) { if (e.target === mask) mask.remove(); });
  }

  // ---------- 小区详情弹层（含按房管理视频） ----------

  function findHouse(id) {
    return houses.find(function (x) { return String(x.id) === String(id); });
  }

  function roomHtml(r) {
    return '<div class="room-block" data-room="' + r.id + '">' +
      '<div class="room-head"><div style="min-width:0">' +
      '<div class="rname">' + esc(r.title) + "</div>" +
      '<div class="rmeta">' +
      (r.size ? "<span>📐 " + esc(r.size) + "</span>" : "") +
      (r.price ? "<span>💰 " + esc(r.price) + "</span>" : "") +
      ((r.videos || []).length ? "<span>📹 " + r.videos.length + " 个视频</span>" : "") +
      "</div></div>" +
      '<div class="rops">' +
      '<button class="icon-btn" data-edit-room="' + r.id + '">编辑</button>' +
      '<button class="icon-btn del" data-del-room="' + r.id + '">删除</button></div></div>' +
      (r.notes ? '<div class="room-notes">' + esc(r.notes) + "</div>" : "") +
      '<div class="room-vids">' +
      (r.videos || []).map(function (v) {
        return '<div class="vcell">' +
          (v.label ? '<div class="dim">' + esc(v.label) + "</div>" : "") +
          '<div class="vwrap"><video controls preload="metadata" playsinline src="' + v.url + '"></video>' +
          '<button class="vfs" data-fs-vid title="放大播放">⤢</button></div>' +
          '<div class="vmeta"><span>' + esc(v.orig_name) + " · " + HouseApp.fmtSize(v.size) + "</span>" +
          '<button class="del" data-del-vid="' + v.id + '">删除</button></div></div>';
      }).join("") +
      '<button class="vadd" data-add-room-vid="' + r.id + '" style="align-self:start">＋ 传视频</button>' +
      "</div></div>";
  }

  function openDetail(h) {
    var mask = document.createElement("div");
    mask.className = "detail-mask";
    mask.dataset.houseId = h.id;
    mask.innerHTML = detailHtml(h);
    document.body.appendChild(mask);
    mask.addEventListener("click", function (e) {
      if (e.target === mask) mask.remove();
    });
    mask.querySelector(".close").addEventListener("click", function () { mask.remove(); });
  }

  function detailHtml(h) {
    var tags =
      (h.metro_ok ? '<span class="tag ok">🚇 地铁800m内</span>' : '<span class="tag no">🚇 地铁远</span>') +
      (h.car_free ? '<span class="tag ok">🚗 人车分流</span>' : '<span class="tag no">🚗 人车不分流</span>') +
      (h.middle_fixed ? '<span class="tag ok">🏫 初中固定对口</span>' : '<span class="tag no">🏫 初中不固定</span>') +
      (h.property_fee ? '<span class="tag fee">物业 ' + esc(h.property_fee) + "</span>" : "");
    var items =
      (h.location ? '<div class="d-item"><dt>位置</dt><dd>' + esc(h.location) + "</dd></div>" : "") +
      (h.metro ? '<div class="d-item"><dt>地铁</dt><dd>' + esc(h.metro) + "</dd></div>" : "") +
      (h.property_company ? '<div class="d-item"><dt>小区物业</dt><dd>' + esc(h.property_company) + "</dd></div>" : "") +
      (h.kindergarten ? '<div class="d-item"><dt>幼儿园</dt><dd>' + esc(h.kindergarten) + "</dd></div>" : "") +
      (h.primary_school ? '<div class="d-item"><dt>小学</dt><dd>' + esc(h.primary_school) + "</dd></div>" : "") +
      (h.middle_school ? '<div class="d-item"><dt>初中</dt><dd>' + esc(h.middle_school) + "</dd></div>" : "");
    function pcList(text, cls) {
      var pts = HouseApp.splitPoints(text);
      if (!pts.length) return "";
      return '<div class="' + cls + '"><h4>' + (cls === "pros" ? "优点" : "缺点") + "</h4><ul>" +
        pts.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></div>";
    }
    var rooms = (h.rooms || []).map(roomHtml).join("");
    var legacy = (h.videos || []).map(function (v) {
      return '<div class="vcell">' +
        (v.label ? '<div class="dim">' + esc(v.label) + "</div>" : "") +
        '<div class="vwrap"><video controls preload="metadata" playsinline src="' + v.url + '"></video>' +
        '<button class="vfs" data-fs-vid title="放大播放">⤢</button></div>' +
        '<div class="vmeta"><span>' + esc(v.orig_name) + " · " + HouseApp.fmtSize(v.size) + "</span>" +
        '<button class="del" data-del-vid="' + v.id + '">删除</button></div></div>';
    }).join("");
    return '<div class="detail-panel">' +
      '<div class="detail-head"><div><h3 class="serif">' + esc(h.name) + "</h3>" +
      '<div class="dim" style="font-size:12px;color:var(--muted)">' + esc(h.region || "") +
      (h.location ? " · " + esc(h.location) : "") + "</div></div>" +
      '<button class="close">关闭 ✕</button></div>' +
      '<div class="detail-tags">' + tags + "</div>" +
      (items ? '<dl class="detail-grid">' + items + "</dl>" : "") +
      (h.pros || h.cons ? '<div class="d-pc">' + pcList(h.pros, "pros") + pcList(h.cons, "cons") + "</div>" : "") +
      (h.notes ? '<div class="room-notes">' + esc(h.notes) + "</div>" : "") +
      '<div class="detail-sec-title"><h4>🏠 看过的房子 ' + (h.rooms || []).length + " 套</h4>" +
      '<button class="btn" data-new-room="' + h.id + '" style="min-height:36px;padding:6px 14px">＋ 添加房子</button></div>' +
      (rooms || '<div class="no-room-tip">还没记房子。点「添加房子」填上户型/大小/价格，再往里面传视频。</div>') +
      ((h.videos || []).length ? '<div class="detail-sec-title"><h4>📹 小区级视频（早年直传）</h4></div><div class="room-vids">' + legacy + "</div>" : "") +
      "</div>";
  }

  function refreshDetail(mask, hid) {
    var h = findHouse(hid);
    if (!mask || !h) return;
    mask.innerHTML = detailHtml(h);
    // 注意：mask 本身的背景点击关闭已在 openDetail 绑过一次，这里只重绑内层按钮
    mask.querySelector(".close").addEventListener("click", function () { mask.remove(); });
  }

  function openRoomModal(h, room, detailMask) {
    var isEdit = !!room;
    var mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.innerHTML = '<div class="modal"><h3>' + (isEdit ? "编辑房子" : "添加房子") + " · " + esc(h.name) + "</h3>" +
      '<div class="grid2">' +
      fieldHtml({ key: "rtitle", label: "房子叫法 *", type: "text", ph: "例如：2栋 3室2厅 / 东边户 89㎡" }, isEdit ? room.title : "") +
      fieldHtml({ key: "rsize", label: "大小", type: "text", ph: "例如：89㎡ / 建面105得房88" }, isEdit ? room.size : "") +
      fieldHtml({ key: "rprice", label: "价格", type: "text", ph: "例如：挂185万 / 到手175" }, isEdit ? room.price : "") +
      fieldHtml({ key: "rnotes", label: "这套房的备注", type: "text", ph: "例如：中层采光好，业主急卖" }, isEdit ? room.notes : "") +
      "</div>" +
      '<div class="field"><label>看房视频（可现在一起传，也可以以后再补）</label>' +
      '<button type="button" class="vadd" data-pick-vid>📹 选择视频文件</button>' +
      '<span class="picked" id="mf-vid-name" style="margin-left:8px"></span>' +
      '<div class="progress" id="mf-vid-bar" style="margin-top:8px"><i></i></div>' +
      '<input type="file" id="mf-vid-file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" hidden></div>' +
      '<div class="modal-ops"><button class="btn ghost" data-mcancel>取消</button>' +
      '<button class="btn" data-msave>' + (isEdit ? "保存" : "添加") + "</button></div></div>";
    document.body.appendChild(mask);

    var vidFile = null;
    var vidInput = mask.querySelector("#mf-vid-file");
    var vidName = mask.querySelector("#mf-vid-name");
    var vidBar = mask.querySelector("#mf-vid-bar");
    var vidBarInner = vidBar.querySelector("i");
    var saveBtn = mask.querySelector("[data-msave]");

    mask.querySelector("[data-pick-vid]").addEventListener("click", function () { vidInput.click(); });
    vidInput.addEventListener("change", function () {
      var f = vidInput.files[0];
      if (!f) return;
      if (!/\.(mp4|mov|m4v|webm)$/i.test(f.name)) {
        vidName.textContent = "不支持的格式：" + f.name;
        vidName.style.color = "var(--danger)";
        vidFile = null;
        return;
      }
      vidName.style.color = "";
      vidFile = f;
      vidName.textContent = "已选：" + f.name + "（" + HouseApp.fmtSize(f.size) + "）";
    });

    mask.querySelector("[data-mcancel]").addEventListener("click", function () { mask.remove(); });
    mask.addEventListener("click", function (e) { if (e.target === mask) mask.remove(); });

    saveBtn.addEventListener("click", function () {
      var body = {
        title: document.getElementById("mf-rtitle").value.trim(),
        size: document.getElementById("mf-rsize").value.trim(),
        price: document.getElementById("mf-rprice").value.trim(),
        notes: document.getElementById("mf-rnotes").value.trim()
      };
      if (!body.title) { alert("房子叫法必填（如：2栋 3室2厅）"); return; }

      // 第一步：存房子
      var url = isEdit ? "/api/rooms/" + room.id : "/api/houses/" + h.id + "/rooms";
      fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "X-Site-Password": HouseApp.getPassword() },
        body: JSON.stringify(body)
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) { alert(res.d.error || "保存失败"); return; }
          var rid = isEdit ? room.id : res.d.room.id;
          // 第二步：带视频就一起传（带进度条）
          if (!vidFile) { mask.remove(); loadRefresh(h.id, detailMask); return; }
          saveBtn.disabled = true;
          saveBtn.textContent = "上传视频中…";
          mask.querySelector("[data-mcancel]").disabled = true;
          var fd = new FormData();
          fd.append("file", vidFile);
          var xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/rooms/" + rid + "/videos");
          xhr.setRequestHeader("X-Site-Password", HouseApp.getPassword());
          vidBar.classList.add("on");
          xhr.upload.addEventListener("progress", function (ev) {
            if (ev.lengthComputable) {
              var pct = Math.round((ev.loaded / ev.total) * 100);
              vidBarInner.style.width = pct + "%";
              saveBtn.textContent = "上传视频 " + pct + "%";
            }
          });
          xhr.addEventListener("load", function () {
            if (xhr.status < 200 || xhr.status >= 300) {
              var d = {};
              try { d = JSON.parse(xhr.responseText); } catch (e) {}
              alert("房子已保存，但视频上传失败：" + (d.error || xhr.status));
            }
            mask.remove();
            loadRefresh(h.id, detailMask);
          });
          xhr.addEventListener("error", function () {
            alert("房子已保存，但视频上传失败：网络错误");
            mask.remove();
            loadRefresh(h.id, detailMask);
          });
          xhr.send(fd);
        }).catch(function () { alert("网络错误"); });
    });
  }

  /** 重新拉数据并刷新表格 + 打开着的详情弹层 */
  function loadRefresh(hid, detailMask) {
    HouseApp.loadHouses(function (data) {
      houses = data;
      render();
      if (detailMask && document.body.contains(detailMask)) refreshDetail(detailMask, hid);
    });
  }

  function pickAndUpload(rid, hid, detailMask) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm";
    input.addEventListener("change", function () {
      if (!input.files[0]) return;
      var fd = new FormData();
      fd.append("file", input.files[0]);
      fd.append("label", "");
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/rooms/" + rid + "/videos");
      xhr.setRequestHeader("X-Site-Password", HouseApp.getPassword());
      xhr.addEventListener("load", function () {
        var d = {};
        try { d = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) loadRefresh(hid, detailMask);
        else alert(d.error || "上传失败");
      });
      xhr.addEventListener("error", function () { alert("网络错误，上传失败"); });
      xhr.send(fd);
    });
    input.click();
  }

  // 详情弹层内的事件委托（挂在 document 上，弹层动态创建）
  document.addEventListener("click", function (e) {
    var mask = e.target.closest(".detail-mask");
    var hid = mask ? mask.dataset.houseId : null;

    var newRoom = e.target.closest("[data-new-room]");
    if (newRoom && mask) { openRoomModal(findHouse(hid), null, mask); return; }

    var editRoom = e.target.closest("[data-edit-room]");
    if (editRoom && mask) {
      var h = findHouse(hid);
      var r = (h.rooms || []).find(function (x) { return String(x.id) === editRoom.getAttribute("data-edit-room"); });
      if (r) openRoomModal(h, r, mask);
      return;
    }

    var delRoom = e.target.closest("[data-del-room]");
    if (delRoom && mask) {
      if (!confirm("确定删除这套房？里面的看房视频会一并删除，不可恢复。")) return;
      fetch("/api/rooms/" + delRoom.getAttribute("data-del-room"), {
        method: "DELETE", headers: { "X-Site-Password": HouseApp.getPassword() }
      }).then(function (r) { return r.json(); })
        .then(function (d) { if (d.ok) loadRefresh(hid, mask); else alert(d.error || "删除失败"); });
      return;
    }

    var addVid = e.target.closest("[data-add-room-vid]");
    if (addVid && mask) { pickAndUpload(addVid.getAttribute("data-add-room-vid"), hid, mask); return; }
  });

  // ---------- 事件委托 ----------

  listEl.addEventListener("click", function (e) {
    var editBtn = e.target.closest("[data-detail]");
    if (editBtn) {
      var h = findHouse(editBtn.getAttribute("data-detail"));
      if (h) openDetail(h);
      return;
    }
    var editRow = e.target.closest("[data-edit]");
    if (editRow) {
      var h2 = findHouse(editRow.getAttribute("data-edit"));
      if (h2) openModal(h2);
      return;
    }
    var delBtn = e.target.closest("[data-del]");
    if (delBtn) {
      var id = delBtn.getAttribute("data-del");
      var hh = houses.find(function (x) { return String(x.id) === String(id); });
      if (!confirm("确定删除「" + (hh ? hh.name : "") + "」？该小区的看房视频也会一并删除，不可恢复。")) return;
      fetch("/api/houses/" + id, { method: "DELETE", headers: { "X-Site-Password": HouseApp.getPassword() } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) {
            houses = houses.filter(function (x) { return String(x.id) !== String(id); });
            render();
          } else { alert(d.error || "删除失败"); }
        });
      return;
    }
    var vidBtn = e.target.closest("[data-del-vid]");
    if (vidBtn) {
      if (!confirm("确定删除这个视频吗？")) return;
      var vid = vidBtn.getAttribute("data-del-vid");
      var inMask = e.target.closest(".detail-mask");
      fetch("/api/videos/" + vid, { method: "DELETE", headers: { "X-Site-Password": HouseApp.getPassword() } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) {
            if (inMask) { loadRefresh(inMask.dataset.houseId, inMask); }
            else { loadRefresh(null, null); }
          }
        });
      return;
    }
  });

  qEl.addEventListener("input", function () { filters.q = qEl.value.trim(); render(); });
  chipsEl.addEventListener("click", function () { setTimeout(render, 0); });

  // 视频放大：自定义灯箱（不用原生 Fullscreen API——iPhone Safari/微信内置浏览器里原生全屏退出不可靠）
  // 做法：把 video 节点临时搬进铺满屏幕的黑色遮罩层，右上角常驻 ✕ 退出；关闭时搬回原位、保留进度
  var vboxOrigin = null;
  function openVideoBox(video) {
    if (document.querySelector(".vbox-mask")) return;
    vboxOrigin = video.parentElement;  // .vwrap
    var wasPlaying = !video.paused;
    var mask = document.createElement("div");
    mask.className = "vbox-mask";
    mask.innerHTML = '<button class="vbox-close" title="退出全屏">✕</button>';
    mask.appendChild(video);
    document.body.appendChild(mask);
    document.body.classList.add("no-scroll");
    if (wasPlaying) video.play();
    function closeBox() {
      vboxOrigin.insertBefore(video, vboxOrigin.firstChild);  // 放回 ⤢ 按钮前面，恢复原顺序
      video.pause();
      mask.remove();
      document.body.classList.remove("no-scroll");
      vboxOrigin = null;
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") closeBox(); }
    mask.querySelector(".vbox-close").addEventListener("click", closeBox);
    document.addEventListener("keydown", onKey);
  }

  document.addEventListener("click", function (e) {
    var fsBtn = e.target.closest("[data-fs-vid]");
    if (!fsBtn) return;
    var cell = fsBtn.closest(".vcell") || fsBtn.closest(".vmini > div");
    var video = cell ? cell.querySelector("video") : null;
    if (video) openVideoBox(video);
  });

  // 竖屏视频自动加 .portrait：网格里按原始竖版比例放大显示（loadedmetadata 不冒泡，需捕获阶段监听）
  document.addEventListener("loadedmetadata", function (e) {
    if (e.target && e.target.tagName === "VIDEO") {
      e.target.classList.toggle("portrait", e.target.videoHeight > e.target.videoWidth);
    }
  }, true);

  document.getElementById("add-btn").addEventListener("click", function () { openModal(null); });
  document.getElementById("view-toggle").addEventListener("click", function () {
    viewPref = isMobile() ? "pc" : "mobile";
    try { localStorage.setItem("house_view", viewPref); } catch (e) {}
    lastMobile = isMobile();
    render();
  });

  HouseApp.loadHouses(function (data) {
    houses = data;
    render();
  });
})();
