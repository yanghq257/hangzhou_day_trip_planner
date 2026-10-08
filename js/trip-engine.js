/*!
 * trip-engine.js
 * 杭州主城区游玩锻炼一日路线规划器 —— 纯前端规则引擎。
 *
 * 本文件由原 Python 后端 utils.py 1:1 等价翻译而来：
 *   - 常量、静态数据（景点库/别名/三级联动/预存坐标）
 *   - 全部纯规则算法（匹配/合并/贪心/交通/时间轴/主流程）
 *   - 高德 Web 服务 REST 调用已移除，全部改用高德 JS SDK（AMap.Geocoder / Walking / Driving）
 *
 * 依赖：浏览器全局对象 AMap（由 main.js 动态加载高德 JS API 1.4.15）。
 * 所有结果通过 window.TripEngine 暴露给页面。
 */
(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // 规划常量
  // -------------------------------------------------------------------------
  var MAIN_URBAN_DISTRICTS = new Set([
    "上城区", "拱墅区", "西湖区", "滨江区", "余杭区",
    "萧山区", "临平区", "钱塘区", "下城区", "江干区"
  ]);
  var HANGZHOU_DISTRICTS = new Set([
    "上城区", "拱墅区", "西湖区", "滨江区", "余杭区",
    "萧山区", "临平区", "钱塘区", "富阳区", "临安区"
  ]);
  var WALK_LIMIT_MIN = 40;          // 步行超过 40 分钟禁止选用步行
  var BUFFER_FACTOR = 1.2;          // 交通耗时缓冲系数
  var MAX_TOTAL_MINUTES = 720;      // 总时长超过 12 小时给出警告
  var TRAVEL_RATIO_WARN = 0.8;      // 路上耗时 / 游玩时长 超过 0.8 给出警告
  var BOAT_MINUTES = 30;            // 孤岛游船接驳估算耗时（分钟）
  var DEFAULT_START_TIME = "09:00";
  var HTTP_TIMEOUT = 10;            // 保留原常量；前端已不使用 REST fetch
  var CONNECTED_HIKING_MEMBERS = ["老和山", "北高峰"];  // 连通登山线路成员（按山脊线串联）
  var MULTI_CONNECTED_HIKING = [
    ["老和山", "灵峰山", "北高峰"],
    ["北高峰", "美人峰", "龙门山"],
    ["虎跑公园", "贵人阁", "玉皇山"],
    ["五云山", "龙井村"],
    ["龙门山", "棋盘山", "狮峰"],
    ["吉庆山", "天马山", "北高峰"]
  ];

  // -------------------------------------------------------------------------
  // 异常类
  // -------------------------------------------------------------------------
  function PlanError(message) {
    this.name = 'PlanError';
    this.message = message || '';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PlanError);
    } else {
      this.stack = (new Error()).stack;
    }
  }
  PlanError.prototype = Object.create(Error.prototype);
  PlanError.prototype.constructor = PlanError;

  // -------------------------------------------------------------------------
  // 内置地址数据（主城区 -> 街道 -> 小区；供前端三级联动使用）
  // -------------------------------------------------------------------------
  var CITY_LOCATIONS = {
    "中杭府": [120.0770, 30.2830],          // 西湖区蒋村板块
    "武林广场": [120.1620, 30.2790],
    "西湖文化广场": [120.1620, 30.2870],
    "杭州东站": [120.2130, 30.2900],
    "杭州站（城站）": [120.1810, 30.2440],
    "钱江新城市民中心": [120.2120, 30.2460],
    "新城国际花园彩园": [120.2143, 30.2584],  // 上城区钱江新城庆和路69号
    "滨江区政府": [120.2070, 30.2110],
    "拱宸桥": [120.1450, 30.3180]
  };

  var DISTRICT_STREET_COMMUNITY = {
    "上城区": {
      "四季青街道": ["新城国际花园彩园", "新城国际花园丽园", "万象城悦府", "庆春御府", "钱江三苑", "运新花苑", "水岸枫庭", "东方润园"],
      "湖滨街道": ["湖滨公寓", "平海公寓", "东坡路社区", "岳王公寓"],
      "清波街道": ["柳翠井巷社区", "清波门社区", "清河坊社区", "吴山公寓"],
      "小营街道": ["葵巷社区", "马市街社区", "紫金社区", "翰林花园"],
      "望江街道": ["近江东园社区", "望江新园一园", "望江新园二园", "始板桥社区", "海潮雅园"],
      "采荷街道": ["采荷一区", "采荷二区", "采荷翠柳邨", "采荷芙蓉邨", "夕照新村"],
      "南星街道": ["蓝色钱江", "阳光海岸", "春江花月", "凤凰苑"],
      "近江街道": ["近江小区"],
      "紫阳街道": ["凤凰北苑"],
      "彭埠街道": ["艮山府"],
      "公共交通/地标": ["城站火车站", "钱江新城森林公园"]
    },
    "西湖区": {
      "蒋村街道": ["中杭府", "西溪诚园", "万科西庐", "蒋村花园", "西溪蝶园", "河滨之城", "融创河滨之城"],
      "灵隐街道": ["曙光新村", "求是村", "玉古路社区", "东山弄社区"],
      "北山街道": ["松木场社区", "保俶路社区", "桃花弄社区", "友谊社区"],
      "翠苑街道": ["翠苑一区", "翠苑二区", "翠苑三区", "翠苑四区", "古荡湾社区"],
      "文新街道": ["竞舟社区", "沁雅花园", "湖畔花园", "星洲花园", "南都花园"],
      "古荡街道": ["古荡新村东区", "古荡新村西区", "嘉绿名苑", "嘉绿西苑"],
      "留下街道": ["西溪源村社区", "和家园", "留下西苑"],
      "转塘街道": ["之江家园"],
      "三墩镇": ["三墩颐景园"],
      "西溪街道": ["文三新村"],
      "公共交通/地标": ["西溪国家湿地公园", "浙江图书馆"]
    },
    "拱墅区": {
      "朝晖街道": ["朝晖一区", "朝晖二区", "朝晖五区", "朝晖九区", "西湖新城"],
      "米市巷街道": ["沈塘桥社区", "米市巷社区", "红石社区", "夹城巷社区"],
      "小河街道": ["小河直街社区", "长征桥社区", "明真宫社区", "塘河新村"],
      "拱宸桥街道": ["拱宸桥社区", "登云路社区", "永和坊", "桥西社区", "运河宸园"],
      "祥符街道": ["申花路社区", "方家花苑", "吉如家园", "蓝孔雀社区"],
      "湖墅街道": ["仓基新村", "湖墅新村", "霞湾巷社区"],
      "大关街道": ["大关东苑"],
      "康桥街道": ["康桥花园"],
      "和睦街道": ["和睦新村"],
      "公共交通/地标": ["西湖文化广场", "拱宸桥运河广场"]
    },
    "滨江区": {
      "西兴街道": ["滨康小区", "官河锦庭", "阳光华庭", "风情苑", "金茂府", "杭州壹号院"],
      "长河街道": ["白金海岸", "江南豪园", "钱塘春晓", "闻涛公寓", "晶都花园", "绿城明月江南", "滨江区政府宿舍"],
      "浦沿街道": ["之江公寓", "浦沿社区", "超级星期天公寓", "金盛曼城", "滨文苑", "钱江湾花园"],
      "公共交通/地标": ["杭州奥体中心", "滨江文化中心"]
    }
  };

  // -------------------------------------------------------------------------
  // 内置景点库（杭州主城区）
  // -------------------------------------------------------------------------
  var PLACES = [
    {name: "宝石山", lng: 120.1420, lat: 30.2590, is_hiking: true,
     visit_minutes: 90, is_water_island: false,
     description: "西湖边经典登山线，可俯瞰断桥与保俶塔。"},
    {name: "北高峰", lng: 120.1110, lat: 30.2560, is_hiking: true,
     visit_minutes: 150, is_water_island: false,
     description: "灵隐寺后山，登顶可远眺西溪与西湖。",
     end_climb_point: "北高峰索道站",
     end_climb_lng: 120.1068, end_climb_lat: 30.2431},
    {name: "玉皇山", lng: 120.1390, lat: 30.2140, is_hiking: true,
     visit_minutes: 120, is_water_island: false,
     description: "西湖群山东侧，道教文化与江湖汇观景致。"},
    {name: "南高峰", lng: 120.1080, lat: 30.2180, is_hiking: true,
     visit_minutes: 60, is_water_island: false,
     description: "西湖群山南侧高点，茶园与登高观景结合。"},
    {name: "老和山", lng: 120.1190, lat: 30.2650, is_hiking: true,
     visit_minutes: 40, is_water_island: false,
     description: "城西轻量级登山点，适合短时间锻炼。"},
    {name: "凤凰山", lng: 120.1500, lat: 30.2250, is_hiking: true,
     visit_minutes: 45, is_water_island: false,
     description: "南宋皇城遗址所在，人文与山林步道结合。"},
    {name: "九曜山", lng: 120.1260, lat: 30.2100, is_hiking: true,
     visit_minutes: 35, is_water_island: false,
     description: "西湖西南角小山，可望苏堤与雷峰塔。"},
    {name: "半山国家森林公园", lng: 120.1770, lat: 30.3500, is_hiking: true,
     visit_minutes: 150, is_water_island: false,
     description: "城北森林公园，适合半天登山徒步。"},
    {name: "皋亭山", lng: 120.2100, lat: 30.3600, is_hiking: true,
     visit_minutes: 60, is_water_island: false,
     description: "城东北登山点，可俯瞰丁桥与半山。"},
    {name: "马家坞", lng: 120.1111, lat: 30.2590, is_hiking: true,
     visit_minutes: 90, is_water_island: false,
     description: "马家坞观景台（纳福云台），俯瞰西湖与杭城，与北高峰山脊线相连。",
     type: "登山",
     start_climb_point: "马家坞牌坊",
     start_climb_lng: 120.1001, start_climb_lat: 30.2574,
     hiking_route_desc: "马家坞村口沿石阶上山，经纳福云台后接入西湖群山西山游步道",
     end_climb_point: "北高峰",
     hiking_duration_min: 75},

    {name: "西湖断桥", lng: 120.1510, lat: 30.2590, is_hiking: false,
     visit_minutes: 40, is_water_island: false,
     description: "白堤起点，西湖最经典的临水观景点。"},
    {name: "苏堤", lng: 120.1280, lat: 30.2200, is_hiking: false,
     visit_minutes: 120, is_water_island: false,
     description: "横贯西湖的长堤，适合步行或骑行观景。"},
    {name: "太子湾公园", lng: 120.1280, lat: 30.2150, is_hiking: false,
     visit_minutes: 60, is_water_island: false,
     description: "以郁金香与溪流草坪闻名的城市公园。"},
    {name: "花港观鱼", lng: 120.1350, lat: 30.2180, is_hiking: false,
     visit_minutes: 60, is_water_island: false,
     description: "西湖十景之一，观鱼与园林景观结合。"},
    {name: "曲院风荷", lng: 120.1260, lat: 30.2500, is_hiking: false,
     visit_minutes: 60, is_water_island: false,
     description: "西湖十景之一，夏日荷花景观。"},
    {name: "玉泉", lng: 120.1210, lat: 30.2542, is_hiking: false,
     visit_minutes: 45, is_water_island: false,
     description: "杭州植物园内「玉泉鱼跃」，观鱼与园林景观结合。",
     type: "观光", tags: ["观鱼", "植物园", "园林"]},
    {name: "灵隐飞来峰", lng: 120.1010, lat: 30.2400, is_hiking: false,
     visit_minutes: 120, is_water_island: false,
     description: "千年古刹与石窟造像，人文底蕴深厚。"},
    {name: "龙井村", lng: 120.1080, lat: 30.2220, is_hiking: false,
     visit_minutes: 90, is_water_island: false,
     description: "龙井茶核心产区，茶园与村落观光。"},
    {name: "九溪烟树", lng: 120.0990, lat: 30.1870, is_hiking: false,
     visit_minutes: 90, is_water_island: false,
     description: "九溪十八涧，溪流与林木相映。"},
    {name: "云栖竹径", lng: 120.0780, lat: 30.1730, is_hiking: false,
     visit_minutes: 90, is_water_island: false,
     description: "竹林幽径，清幽避暑的徒步路线。"},
    {name: "西溪湿地", lng: 120.0660, lat: 30.2690, is_hiking: false,
     visit_minutes: 120, is_water_island: false,
     description: "城市湿地公园，水网与自然生态景观。"},
    {name: "河坊街", lng: 120.1660, lat: 30.2400, is_hiking: false,
     visit_minutes: 90, is_water_island: false,
     description: "杭州历史文化街区，小吃与老字号集中。"},
    {name: "南宋御街", lng: 120.1680, lat: 30.2450, is_hiking: false,
     visit_minutes: 60, is_water_island: false,
     description: "南宋都城御道，骑楼建筑与步行街。"},
    {name: "吴山广场", lng: 120.1620, lat: 30.2390, is_hiking: false,
     visit_minutes: 60, is_water_island: false,
     description: "老城区休闲广场，紧邻河坊街与吴山。"},
    {name: "雷峰塔", lng: 120.1450, lat: 30.2300, is_hiking: false,
     visit_minutes: 60, is_water_island: false,
     description: "西湖十景「雷峰夕照」，登塔俯瞰西湖。"},
    {name: "岳王庙", lng: 120.1320, lat: 30.2550, is_hiking: false,
     visit_minutes: 45, is_water_island: false,
     description: "纪念岳飞的祠庙，位于北山街。"},
    {name: "钱江新城城市阳台", lng: 120.2100, lat: 30.2450, is_hiking: false,
     visit_minutes: 45, is_water_island: false,
     description: "钱塘江畔城市观景平台，可看灯光秀。"},
    {name: "湘湖", lng: 120.2300, lat: 30.1450, is_hiking: false,
     visit_minutes: 90, is_water_island: false,
     description: "杭州南部湖泊景区，湖光山色较西湖更清静。"},
    {name: "拱宸桥", lng: 120.1310, lat: 30.3210, is_hiking: false,
     visit_minutes: 60, is_water_island: false,
     description: "京杭大运河杭州段标志性古桥与历史街区。"},

    {name: "三潭印月", lng: 120.1450, lat: 30.2350, is_hiking: false,
     visit_minutes: 60, is_water_island: true,
     description: "西湖湖中岛，一元纸币背面图案取景地，需游船前往。"},
    {name: "湖心亭", lng: 120.1480, lat: 30.2400, is_hiking: false,
     visit_minutes: 45, is_water_island: true,
     description: "西湖湖心小岛，需游船前往。"},
    {name: "阮公墩", lng: 120.1400, lat: 30.2420, is_hiking: false,
     visit_minutes: 45, is_water_island: true,
     description: "西湖湖中岛，环境清幽，需游船前往。"},
    {name: "虎跑公园", lng: 120.1378, lat: 30.2045, is_hiking: true,
     visit_minutes: 60, is_water_island: false,
     description: "虎跑梦泉，西湖新十景之一，以虎跑泉水、济公传说和山林步道闻名"},

    {name: "吴山", lng: 120.1600, lat: 30.2370, is_hiking: true,
     visit_minutes: 90, is_water_island: false,
     description: "吴山天风，老城山体，城隍阁俯瞰杭州老城，适合轻登山。",
     start_climb_point: "吴山广场", start_climb_lng: 120.1620, start_climb_lat: 30.2390,
     end_climb_point: "河坊街出口", end_climb_lng: 120.1640, end_climb_lat: 30.2400,
     hiking_duration_min: 70},
    {name: "冠山公园", lng: 120.1440, lat: 30.1820, is_hiking: true,
     visit_minutes: 80, is_water_island: false,
     description: "滨江区冠山，山顶可眺望钱塘江与滨江城区，难度轻松。",
     start_climb_point: "冠山公园南入口", start_climb_lng: 120.1432, start_climb_lat: 30.1805,
     end_climb_point: "冠山北出口", end_climb_lng: 120.1451, end_climb_lat: 30.1833,
     hiking_duration_min: 60},
    {name: "龙坞茶镇", lng: 120.0320, lat: 30.2210, is_hiking: true,
     visit_minutes: 120, is_water_island: false,
     description: "万亩龙井茶园，光明寺水库，平缓茶山徒步，适合休闲登山。",
     start_climb_point: "龙坞何家村市集", start_climb_lng: 120.0301, start_climb_lat: 30.2202,
     end_climb_point: "光明寺水库出口", end_climb_lng: 120.0344, end_climb_lat: 30.2235,
     hiking_duration_min: 90},
    {name: "灵峰山", lng: 120.1040, lat: 30.2610, is_hiking: true,
     visit_minutes: 70, is_water_island: false,
     description: "十里龙脊山脊节点，连接老和山、美人峰至北高峰，山林清幽。",
     start_climb_point: "老和云起步道口", start_climb_lng: 120.1180, start_climb_lat: 30.2640,
     end_climb_point: "北高峰方向石人亭岔口", end_climb_lng: 120.1020, end_climb_lat: 30.2580,
     hiking_duration_min: 55},
    {name: "美人峰", lng: 120.0960, lat: 30.2540, is_hiking: true,
     visit_minutes: 75, is_water_island: false,
     description: "十里龙脊主要山峰，视野开阔，可远眺西溪与西湖。",
     start_climb_point: "北高峰财神庙后山步道", start_climb_lng: 120.1070, start_climb_lat: 30.2550,
     end_climb_point: "龙门山方向山脊岔口", end_climb_lng: 120.0920, end_climb_lat: 30.2510,
     hiking_duration_min: 60},
    {name: "龙门山", lng: 120.0860, lat: 30.2480, is_hiking: true,
     visit_minutes: 80, is_water_island: false,
     description: "西山十里龙脊西段高峰，山林野趣，通往石人亭、法喜寺下撤口。",
     start_climb_point: "美人峰山脊过来岔口", start_climb_lng: 120.0910, start_climb_lat: 30.2500,
     end_climb_point: "石人亭下撤天竺方向", end_climb_lng: 120.0820, end_climb_lat: 30.2440,
     hiking_duration_min: 65},
    {name: "五云山", lng: 120.0820, lat: 30.2040, is_hiking: true,
     visit_minutes: 100, is_water_island: false,
     description: "十里琅珰起点，真际寺古树，下山可达九溪烟树。",
     start_climb_point: "九溪烟树登山口", start_climb_lng: 120.0980, start_climb_lat: 30.1880,
     end_climb_point: "十里琅珰龙井村出口", end_climb_lng: 120.0860, end_climb_lat: 30.2120,
     hiking_duration_min: 85},
    {name: "贵人阁", lng: 120.1340, lat: 30.2080, is_hiking: true,
     visit_minutes: 60, is_water_island: false,
     description: "虎跑后山观景制高点，同时看西湖与钱塘江，可连通玉皇山环线。",
     start_climb_point: "虎跑公园后山入口", start_climb_lng: 120.1370, start_climb_lat: 30.2030,
     end_climb_point: "玉皇山慈云岭方向出口", end_climb_lng: 120.1380, end_climb_lat: 30.2130,
     hiking_duration_min: 45},
    {name: "如意尖", lng: 120.0010, lat: 30.2060, is_hiking: true,
     visit_minutes: 150, is_water_island: false,
     description: "杭州城西最高峰，西山百里如意景观带核心，山野长距离徒步。",
     start_climb_point: "大岭村登山入口", start_climb_lng: 119.9940, start_climb_lat: 30.2020,
     end_climb_point: "板壁山水库下撤口", end_climb_lng: 120.0060, end_climb_lat: 30.2100,
     hiking_duration_min: 120},
    {name: "大清谷", lng: 120.0440, lat: 30.2460, is_hiking: true,
     visit_minutes: 90, is_water_island: false,
     description: "西山游步道北段节点，山谷茶园，难度中等，可连接龙坞方向。",
     start_climb_point: "大清谷景区入口", start_climb_lng: 120.0410, start_climb_lat: 30.2430,
     end_climb_point: "龙坞方向游步道岔口", end_climb_lng: 120.0480, end_climb_lat: 30.2490,
     hiking_duration_min: 70},
    {name: "北观音洞", lng: 120.1220, lat: 30.2430, is_hiking: true,
     visit_minutes: 50, is_water_island: false,
     description: "灵隐周边山体，石窟遗迹，连接吉庆山，短途登山。",
     start_climb_point: "灵隐飞来峰西侧山道", start_climb_lng: 120.1170, start_climb_lat: 30.2410,
     end_climb_point: "吉庆山山脊岔口", end_climb_lng: 120.1240, end_climb_lat: 30.2460,
     hiking_duration_min: 40},
    {name: "天马山", lng: 120.1140, lat: 30.2490, is_hiking: true,
     visit_minutes: 60, is_water_island: false,
     description: "灵隐后方山体，连接吉庆山与北高峰，西山游步道节点。",
     start_climb_point: "北观音洞山脊过来岔口", start_climb_lng: 120.1230, start_climb_lat: 30.2470,
     end_climb_point: "北高峰南侧山道出口", end_climb_lng: 120.1120, end_climb_lat: 30.2530,
     hiking_duration_min: 48},
    {name: "吉庆山", lng: 120.1280, lat: 30.2450, is_hiking: true,
     visit_minutes: 55, is_water_island: false,
     description: "西湖西侧山体，毗邻灵隐，可串天马山-北高峰。",
     start_climb_point: "杨公堤郭庄后山入口", start_climb_lng: 120.1310, start_climb_lat: 30.2480,
     end_climb_point: "北观音洞方向山脊岔口", end_climb_lng: 120.1210, end_climb_lat: 30.2420,
     hiking_duration_min: 42},
    {name: "棋盘山", lng: 120.0920, lat: 30.2260, is_hiking: true,
     visit_minutes: 70, is_water_island: false,
     description: "十里琅珰中段制高点，连接龙门山、狮峰，茶园环绕。",
     start_climb_point: "龙门山南侧下山步道", start_climb_lng: 120.0870, start_climb_lat: 30.2290,
     end_climb_point: "狮峰龙井方向岔口", end_climb_lng: 120.0960, end_climb_lat: 30.2220,
     hiking_duration_min: 52},
    {name: "狮峰", lng: 120.0980, lat: 30.2190, is_hiking: true,
     visit_minutes: 65, is_water_island: false,
     description: "狮峰龙井核心产区，十里琅珰必经点位，茶园观景。",
     start_climb_point: "棋盘山过来山脊", start_climb_lng: 120.0950, start_climb_lat: 30.2230,
     end_climb_point: "龙井村下山出口", end_climb_lng: 120.1020, end_climb_lat: 30.2160,
     hiking_duration_min: 48},
    {name: "白鹤峰", lng: 120.1000, lat: 30.2340, is_hiking: true,
     visit_minutes: 60, is_water_island: false,
     description: "天竺群山，俯瞰灵隐寺院群，短途徒步。",
     start_climb_point: "法喜寺后山入口", start_climb_lng: 120.0840, start_climb_lat: 30.2320,
     end_climb_point: "棋盘山北向山道岔口", end_climb_lng: 120.0970, end_climb_lat: 30.2360,
     hiking_duration_min: 45},
    {name: "桃桂山", lng: 120.1080, lat: 30.2510, is_hiking: true,
     visit_minutes: 45, is_water_island: false,
     description: "北高峰南侧小山，连接天马山，灵隐上山的过渡山体。",
     start_climb_point: "天马山北下口", start_climb_lng: 120.1130, start_climb_lat: 30.2480,
     end_climb_point: "北高峰南坡步道", end_climb_lng: 120.1090, end_climb_lat: 30.2540,
     hiking_duration_min: 35},
    {name: "九华山(转塘)", lng: 120.0480, lat: 30.1900, is_hiking: true,
     visit_minutes: 95, is_water_island: false,
     description: "转塘九华山，临近龙坞，茶山与山林结合，人少清静。",
     start_climb_point: "转塘九华村登山口", start_climb_lng: 120.0440, start_climb_lat: 30.1870,
     end_climb_point: "龙坞游步道西南岔口", end_climb_lng: 120.0510, end_climb_lat: 30.1930,
     hiking_duration_min: 72},
    {name: "石岩山", lng: 120.2720, lat: 30.1210, is_hiking: true,
     visit_minutes: 85, is_water_island: false,
     description: "萧山石岩山，一览湘湖全景，湘湖周边登山。",
     start_climb_point: "石岩山东门登山口", start_climb_lng: 120.2700, start_climb_lat: 30.1180,
     end_climb_point: "石岩山西侧下湘湖出口", end_climb_lng: 120.2740, end_climb_lat: 30.1240,
     hiking_duration_min: 62},
    {name: "望宸阁", lng: 120.1740, lat: 30.3530, is_hiking: true,
     visit_minutes: 70, is_water_island: false,
     description: "半山国家森林公园制高点望宸阁，城北登高俯瞰杭城。",
     start_climb_point: "半山公园主入口", start_climb_lng: 120.1790, start_climb_lat: 30.3480,
     end_climb_point: "虎山公园下撤口", end_climb_lng: 120.1710, end_climb_lat: 30.3570,
     hiking_duration_min: 50},

    {name: "孤山公园", lng: 120.1400, lat: 30.2510, is_hiking: false,
     visit_minutes: 70, is_water_island: false,
     description: "西湖孤山，浙江博物馆孤山馆、西泠印社，湖山人文一体。"},
    {name: "柳浪闻莺", lng: 120.1540, lat: 30.2340, is_hiking: false,
     visit_minutes: 60, is_water_island: false,
     description: "西湖十景，南宋御花园，垂柳湖滨大草坪。"},
    {name: "茅家埠", lng: 120.1160, lat: 30.2360, is_hiking: false,
     visit_minutes: 75, is_water_island: false,
     description: "西湖小众水域，野趣湖岸，人少静谧。"},
    {name: "德寿宫", lng: 120.1680, lat: 30.2420, is_hiking: false,
     visit_minutes: 90, is_water_island: false,
     description: "南宋德寿宫遗址，红墙网红打卡，宋代宫殿遗址。"},
    {name: "城隍阁", lng: 120.1605, lat: 30.2378, is_hiking: false,
     visit_minutes: 60, is_water_island: false,
     description: "吴山之巅楼阁，登高俯瞰杭州老城全景。"},
    {name: "万松书院", lng: 120.1470, lat: 30.2280, is_hiking: false,
     visit_minutes: 60, is_water_island: false,
     description: "古代杭州最高学府，梁山伯祝英台传说，周末相亲角。"},
    {name: "六和塔", lng: 120.1320, lat: 30.1920, is_hiking: false,
     visit_minutes: 70, is_water_island: false,
     description: "钱塘江畔千年古塔，登塔眺望钱塘江大桥。"},
    {name: "法喜寺", lng: 120.0830, lat: 30.2330, is_hiking: false,
     visit_minutes: 90, is_water_island: false,
     description: "上天竺法喜讲寺，网红寺庙，求姻缘，山林禅院。"},
    {name: "香积寺", lng: 120.1410, lat: 30.3070, is_hiking: false,
     visit_minutes: 60, is_water_island: false,
     description: "京杭大运河旁古寺，素斋知名。"},
    {name: "小河直街", lng: 120.1430, lat: 30.3120, is_hiking: false,
     visit_minutes: 70, is_water_island: false,
     description: "运河历史街区，文艺咖啡馆，老民居风貌。"}
  ];

  var PLACE_BY_NAME = {};
  PLACES.forEach(function (p) { PLACE_BY_NAME[p.name] = p; });

  var PLACE_ALIAS = {
    "虎跑": "虎跑公园",
    "吴山天风": "吴山",
    "上天竺": "法喜寺",
    "小河直": "小河直街",
    "德寿宫遗址": "德寿宫",
    "冠山": "冠山公园",
    "龙坞": "龙坞茶镇",
    "十里琅珰": "五云山",
    "贵人阁观景台": "贵人阁",
    "如意尖登山": "如意尖",
    "大清谷徒步": "大清谷",
    "望宸阁观景台": "望宸阁",
    "石岩山湘湖": "石岩山",
    "棋盘山十里琅珰": "棋盘山"
  };

  // -------------------------------------------------------------------------
  // 基础工具
  // -------------------------------------------------------------------------
  function toRadians(deg) { return deg * Math.PI / 180.0; }

  function haversineKm(lng1, lat1, lng2, lat2) {
    var r = 6371.0;
    var p1 = toRadians(lat1), p2 = toRadians(lat2);
    var dlat = toRadians(lat2 - lat1);
    var dlng = toRadians(lng2 - lng1);
    var a = Math.sin(dlat / 2) * Math.sin(dlat / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dlng / 2) * Math.sin(dlng / 2);
    return 2 * r * Math.asin(Math.sqrt(a));
  }

  function fmtTime(minutes) {
    minutes = parseInt(minutes, 10) % (24 * 60);
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return (h < 10 ? '0' + h : String(h)) + ':' + (m < 10 ? '0' + m : String(m));
  }

  function guessZoom(diagKm) {
    if (diagKm < 3) return 15;
    if (diagKm < 6) return 14;
    if (diagKm < 12) return 13;
    if (diagKm < 25) return 12;
    if (diagKm < 50) return 11;
    return 10;
  }

  function estimateWalkMinutes(km) {
    return Math.max(1, Math.round(km / 4.5 * 60));
  }

  function estimateDriveMinutes(km) {
    return Math.max(1, Math.round(km / 25.0 * 60 + 5));
  }

  function simplify(coords, maxPoints) {
    if (coords.length <= maxPoints) return coords.slice();
    var stride = Math.ceil(coords.length / maxPoints);
    var out = [];
    for (var i = 0; i < coords.length; i += stride) out.push(coords[i]);
    var last = coords[coords.length - 1];
    if (out[out.length - 1][0] !== last[0] || out[out.length - 1][1] !== last[1]) {
      out.push(last);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // 景点匹配与路线构建
  // -------------------------------------------------------------------------
  function matchPlace(query) {
    var q = (query || '').trim();
    if (!q) return null;
    q = PLACE_ALIAS[q] || q;
    if (PLACE_BY_NAME[q]) return PLACE_BY_NAME[q];
    for (var i = 0; i < PLACES.length; i++) {
      var p = PLACES[i];
      if (p.name.indexOf(q) !== -1 || (q.length >= 2 && q.indexOf(p.name) !== -1)) {
        return p;
      }
    }
    return null;
  }

  function round6(v) { return Math.round(v * 1000000) / 1000000; }

  function mergeConnectedHiking(spots) {
    var result = spots.slice();

    function mergeGroup(group) {
      var names = result.map(function (p) { return p.name; });
      var allIn = group.every(function (m) { return names.indexOf(m) !== -1; });
      if (!allIn) return;

      var members = group.map(function (m) {
        for (var i = 0; i < result.length; i++) if (result[i].name === m) return result[i];
        return null;
      });

      var lngSum = 0, latSum = 0, minSum = 0;
      members.forEach(function (m) {
        lngSum += m.lng;
        latSum += m.lat;
        minSum += parseInt(m.visit_minutes, 10);
      });

      var merged = {
        name: group.join(' → ') + '，连续登山线路',
        lng: round6(lngSum / members.length),
        lat: round6(latSum / members.length),
        is_hiking: true,
        visit_minutes: minSum,
        is_water_island: false,
        description: '沿西湖群山西山游步道连续穿越' + group.join('、') + '，山脊线串联徒步登山。',
        connected_hiking: true,
        members: group.slice()
      };

      var out = [];
      var inserted = false;
      result.forEach(function (p) {
        if (group.indexOf(p.name) !== -1) {
          if (!inserted) { out.push(merged); inserted = true; }
          return;
        }
        out.push(p);
      });
      result = out;
    }

    MULTI_CONNECTED_HIKING.forEach(mergeGroup);

    // 兜底兼容：老和山 → 北高峰 连续登山线路
    var names = result.map(function (p) { return p.name; });
    var fallbackAllIn = CONNECTED_HIKING_MEMBERS.every(function (m) { return names.indexOf(m) !== -1; });
    if (fallbackAllIn) {
      var a = null, b = null;
      result.forEach(function (p) {
        if (p.name === CONNECTED_HIKING_MEMBERS[0]) a = p;
        if (p.name === CONNECTED_HIKING_MEMBERS[1]) b = p;
      });
      var merged = {
        name: '老和山 → 北高峰，连续登山线路',
        lng: round6((a.lng + b.lng) / 2),
        lat: round6((a.lat + b.lat) / 2),
        is_hiking: true,
        visit_minutes: parseInt(a.visit_minutes, 10) + parseInt(b.visit_minutes, 10),
        is_water_island: false,
        description: '沿西湖群山西山游步道连续穿越老和山至北高峰，可远眺西溪湿地与西湖。',
        connected_hiking: true,
        members: CONNECTED_HIKING_MEMBERS.slice()
      };
      var out = [];
      var inserted = false;
      result.forEach(function (p) {
        if (CONNECTED_HIKING_MEMBERS.indexOf(p.name) !== -1) {
          if (!inserted) { out.push(merged); inserted = true; }
          return;
        }
        out.push(p);
      });
      result = out;
    }

    return result;
  }

  function nearest(current, candidates) {
    var best = null, bestD = null;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var d = haversineKm(current.lng, current.lat, c.lng, c.lat);
      if (bestD === null || d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  function greedyOrder(startGeo, places) {
    var result = [];
    var current = startGeo;
    var remaining = places.slice();
    while (remaining.length) {
      var nxt = nearest(current, remaining);
      result.push(nxt);
      remaining.splice(remaining.indexOf(nxt), 1);
      current = nxt;
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // 高德 JS SDK 封装（替代原 REST 调用）
  // -------------------------------------------------------------------------
  function _cityName(city) {
    if (city == null) return '';
    if (typeof city === 'string') return city;
    if (typeof city === 'object') return city.name || '';
    return String(city);
  }

  function _isHangzhouDistrict(name) {
    var d = (name || '').trim();
    if (!d) return false;
    if (d.charAt(d.length - 1) !== '区') d += '区';
    return HANGZHOU_DISTRICTS.has(d);
  }

  function geocode(address, key) {
    return new Promise(function (resolve, reject) {
      if (!key) { reject(new PlanError('请先填写高德 API Key')); return; }
      var rawAddr = (address || '').trim();
      console.log('[geocode] 传入地址:', rawAddr);
      var addr = rawAddr;
      if (addr && addr.indexOf('杭州市') !== 0) addr = '杭州市' + addr;
      console.log('[geocode] 拼接后地址:', addr);

      if (!global.AMap || !global.AMap.Geocoder) {
        reject(new PlanError('高德 JS API 尚未加载，请检查 JS API Key'));
        return;
      }
      var geocoder = new global.AMap.Geocoder({ city: '杭州市' });
      try {
        geocoder.getLocation(addr, function (status, result) {
          console.log('[geocode] status:', status);
          console.log('[geocode] result:', result);
          try {
            if (status === 'complete' && result && result.geocodes && result.geocodes.length) {
              var g = result.geocodes[0];
              var loc = g.location;
              var lng = (loc && typeof loc.getLng === 'function') ? loc.getLng() : (loc && loc.lng);
              var lat = (loc && typeof loc.getLat === 'function') ? loc.getLat() : (loc && loc.lat);
              if (typeof lng !== 'number' || typeof lat !== 'number') {
                reject(new PlanError('地址坐标格式异常：' + address));
                return;
              }
              // 打印高德返回的 adcode / city / district，便于定位城市校验问题
              console.log('[geocode] adcode:', g.adcode);
              console.log('[geocode] city:', g.city);
              console.log('[geocode] district:', g.district);

              var geo = {
                formatted: g.formattedAddress || address,
                lng: lng,
                lat: lat,
                province: (typeof g.province === 'object' && g.province) ? (g.province.name || '') : (g.province || ''),
                city: _cityName(g.city),
                district: (typeof g.district === 'object' && g.district) ? (g.district.name || '') : (g.district || ''),
                adcode: String(g.adcode || '')
              };

              var cityOk = (geo.city === '杭州市');
              var districtOk = _isHangzhouDistrict(geo.district);
              console.log('[geocode] 城市校验 cityOk:', cityOk, 'districtOk:', districtOk, 'city:', geo.city, 'district:', geo.district, 'adcode:', geo.adcode);

              if (!cityOk && !districtOk) {
                reject(new PlanError('该地址不在杭州市范围内，请重新填写'));
                return;
              }
              if (geo.district && !MAIN_URBAN_DISTRICTS.has(geo.district)) {
                geo.warning = '该地点不在传统主城区，通勤距离较长';
              }
              resolve(geo);
            } else {
              reject(new PlanError('地址解析失败，请检查地址是否正确'));
            }
          } catch (callbackErr) {
            console.error('[geocode] 回调处理异常:', callbackErr);
            reject(new PlanError('地址解析失败，请检查地址是否正确'));
          }
        });
      } catch (callErr) {
        console.error('[geocode] getLocation 调用异常:', callErr);
        reject(new PlanError('地址解析失败，请检查地址是否正确'));
      }
    });
  }

  function resolveAddress(address, key) {
    var addr = (address || '').trim();
    if (Object.prototype.hasOwnProperty.call(CITY_LOCATIONS, addr)) {
      var coords = CITY_LOCATIONS[addr];
      return Promise.resolve({
        formatted: addr,
        lng: coords[0],
        lat: coords[1],
        province: '浙江省',
        city: '杭州市',
        district: '',
        adcode: '330100'
      });
    }
    return geocode(addr, key);
  }

  function parseDirection(route) {
    if (!route) return null;
    var seconds = route.time;
    if (seconds === undefined || seconds === null) return null;
    var minutes = Math.max(1, Math.round(Number(seconds) / 60.0));
    var polyline = [];
    var steps = route.steps || [];
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      if (step.path && Object.prototype.toString.call(step.path) === '[object Array]') {
        step.path.forEach(function (pt) {
          var lng = (pt && typeof pt.getLng === 'function') ? pt.getLng() : (pt && pt.lng);
          var lat = (pt && typeof pt.getLat === 'function') ? pt.getLat() : (pt && pt.lat);
          if (typeof lng === 'number' && typeof lat === 'number') polyline.push([lng, lat]);
        });
      } else if (typeof step.polyline === 'string' && step.polyline) {
        step.polyline.split(';').forEach(function (pair) {
          pair = pair.trim();
          if (!pair || pair.indexOf(',') === -1) return;
          var parts = pair.split(',');
          var lng = parseFloat(parts[0]);
          var lat = parseFloat(parts[1]);
          if (!isNaN(lng) && !isNaN(lat)) polyline.push([lng, lat]);
        });
      }
    }
    return { duration_min: minutes, polyline: polyline };
  }

  function amapWalking(lng1, lat1, lng2, lat2, key) {
    return new Promise(function (resolve) {
      if (!global.AMap || !global.AMap.Walking) { resolve(null); return; }
      var walking = new global.AMap.Walking({});
      walking.search([lng1, lat1], [lng2, lat2], function (status, result) {
        if (status === 'complete' && result && result.routes && result.routes.length) {
          resolve(parseDirection(result.routes[0]));
        } else {
          resolve(null);
        }
      });
    });
  }

  function amapDriving(lng1, lat1, lng2, lat2, key) {
    return new Promise(function (resolve) {
      if (!global.AMap || !global.AMap.Driving) { resolve(null); return; }
      var driving = new global.AMap.Driving({});
      driving.search([lng1, lat1], [lng2, lat2], function (status, result) {
        if (status === 'complete' && result && result.routes && result.routes.length) {
          resolve(parseDirection(result.routes[0]));
        } else {
          resolve(null);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // 交通段 / 时间轴
  // -------------------------------------------------------------------------
  function buildLegs(originGeo, destGeo, route, key) {
    var points = [originGeo].concat(route).concat([destGeo]);
    var legs = [];
    var warnings = [];

    function eachLeg() {
      var chain = Promise.resolve();
      for (var i = 0; i < points.length - 1; i++) {
        (function (i) {
          chain = chain.then(function () {
            var start = points[i];
            var end = points[i + 1];
            var startName = start.name || start.formatted || '出发地';
            var endName = end.name || end.formatted || '目的地';
            var startIsland = !!start.is_water_island;
            var endIsland = !!end.is_water_island;

            var leg = {
              start_name: startName,
              end_name: endName,
              start_island: startIsland,
              end_island: endIsland
            };

            if (startIsland || endIsland) {
              leg.mode = '游船';
              leg.duration_min = BOAT_MINUTES;
              leg.polyline = [[start.lng, start.lat], [end.lng, end.lat]];
              legs.push(leg);
              return Promise.resolve();
            }

            var s_lng, s_lat, e_lng, e_lat;
            if (start.is_hiking && end.is_hiking) {
              s_lng = (start.end_climb_lng != null) ? start.end_climb_lng : start.lng;
              s_lat = (start.end_climb_lat != null) ? start.end_climb_lat : start.lat;
              e_lng = (end.start_climb_lng != null) ? end.start_climb_lng : end.lng;
              e_lat = (end.start_climb_lat != null) ? end.start_climb_lat : end.lat;
            } else {
              s_lng = start.lng; s_lat = start.lat;
              e_lng = end.lng; e_lat = end.lat;
            }

            var km = haversineKm(s_lng, s_lat, e_lng, e_lat);
            return amapWalking(s_lng, s_lat, e_lng, e_lat, key).then(function (walk) {
              var walkMin = walk ? walk.duration_min : estimateWalkMinutes(km);
              var walkPolyline = walk ? walk.polyline : null;
              if (walkMin <= WALK_LIMIT_MIN) {
                leg.mode = '步行';
                leg.duration_min = walkMin;
                leg.polyline = walkPolyline || [[s_lng, s_lat], [e_lng, e_lat]];
                return Promise.resolve();
              }
              return amapDriving(s_lng, s_lat, e_lng, e_lat, key).then(function (drive) {
                var driveMin = drive ? drive.duration_min : estimateDriveMinutes(km);
                var drivePolyline = drive ? drive.polyline : null;
                leg.mode = '打车';
                leg.duration_min = driveMin;
                leg.polyline = drivePolyline || [[s_lng, s_lat], [e_lng, e_lat]];
                return Promise.resolve();
              });
            }).then(function () {
              legs.push(leg);
            });
          });
        })(i);
      }
      return chain;
    }

    return eachLeg().then(function () {
      legs.forEach(function (leg) {
        if (leg.mode === '步行' && leg.duration_min > WALK_LIMIT_MIN) {
          warnings.push(leg.start_name + ' → ' + leg.end_name + ' 步行约 ' + leg.duration_min + ' 分钟（>40 分钟），存在超长步行');
        }
        if ((leg.start_island || leg.end_island) && leg.mode !== '游船') {
          warnings.push(leg.start_name + ' → ' + leg.end_name + ' 涉及湖中孤岛，却未使用游船，交通方式非法');
        }
      });
      return [legs, warnings];
    });
  }

  function buildTimeline(originGeo, destGeo, route, legs) {
    var steps = [];
    var parts = DEFAULT_START_TIME.split(':');
    var current = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    var travelTotal = 0;
    var visitTotal = 0;

    steps.push({ '类型': '出发', '地点': originGeo.formatted || '出发地', '时间': fmtTime(current), '耗时分钟': 0 });

    for (var i = 0; i < route.length; i++) {
      var p = route[i];
      var leg = legs[i];
      var buffered = Math.max(1, Math.ceil(leg.duration_min * BUFFER_FACTOR));
      travelTotal += buffered;

      var startT = current;
      var endT = current + buffered;
      steps.push({ '类型': '交通', '起点': leg.start_name, '终点': leg.end_name, '方式': leg.mode, '耗时分钟': buffered, '时间': fmtTime(startT), '结束时间': fmtTime(endT) });
      current = endT;

      startT = current;
      endT = current + parseInt(p.visit_minutes, 10);
      visitTotal += parseInt(p.visit_minutes, 10);
      steps.push({ '类型': '活动', '地点': p.name, '停留分钟': parseInt(p.visit_minutes, 10), '描述': p.description, '是否登山': p.is_hiking, '是否孤岛': p.is_water_island, '时间': fmtTime(startT), '结束时间': fmtTime(endT) });
      current = endT;
    }

    var lastLeg = legs[legs.length - 1];
    var lastBuffered = Math.max(1, Math.ceil(lastLeg.duration_min * BUFFER_FACTOR));
    travelTotal += lastBuffered;
    var sT = current;
    var eT = current + lastBuffered;
    steps.push({ '类型': '交通', '起点': lastLeg.start_name, '终点': lastLeg.end_name, '方式': lastLeg.mode, '耗时分钟': lastBuffered, '时间': fmtTime(sT), '结束时间': fmtTime(eT) });
    current = eT;

    steps.push({ '类型': '到达', '地点': destGeo.formatted || '目的地', '时间': fmtTime(current), '耗时分钟': 0 });

    var startMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    var totalMinutes = current - startMin;
    return [steps, totalMinutes, travelTotal, visitTotal];
  }

  // -------------------------------------------------------------------------
  // 主规划流程
  // -------------------------------------------------------------------------
  function planTrip(originAddr, destinationAddr, hikingBool, mustVisitRaw, count, key) {
    if (!key) return Promise.reject(new PlanError('请先填写高德 API Key'));

    return resolveAddress(originAddr, key).then(function (originGeo) {
      return resolveAddress(destinationAddr, key).then(function (destGeo) {
        return { originGeo: originGeo, destGeo: destGeo };
      });
    }).then(function (geo) {
      var originGeo = geo.originGeo;
      var destGeo = geo.destGeo;
      var warnings = [];

      var pool;
      if (hikingBool) {
        pool = PLACES.slice();
      } else {
        pool = PLACES.filter(function (p) { return !p.is_hiking; });
      }

      var mustInclude = [];
      var unmatched = [];
      mustVisitRaw.forEach(function (raw) {
        var r = (raw || '').trim();
        if (!r) return;
        var p = matchPlace(r);
        if (p === null) { unmatched.push(r); return; }
        if (!hikingBool && p.is_hiking) {
          warnings.push('必去景点「' + p.name + '」为登山点位，与「不爬山」冲突，已忽略');
          return;
        }
        var exists = mustInclude.some(function (m) { return m.name === p.name; });
        if (!exists) mustInclude.push(p);
      });
      unmatched.forEach(function (name) {
        warnings.push('未能识别必去景点「' + name + '」，已忽略');
      });

      var mustInc = mustInclude;
      if (hikingBool) mustInc = mergeConnectedHiking(mustInc);

      var route = greedyOrder(originGeo, mustInc);
      var included = {};
      route.forEach(function (p) { included[p.name] = true; });
      route.forEach(function (p) {
        (p.members || []).forEach(function (memberName) { included[memberName] = true; });
      });

      var candidates = pool.filter(function (p) { return !included[p.name]; });
      var current = route.length ? route[route.length - 1] : originGeo;

      while (route.length < count && candidates.length) {
        if (hikingBool && !route.some(function (p) { return p.is_hiking; })) {
          var hikingPool = candidates.filter(function (p) { return p.is_hiking; });
          if (hikingPool.length) {
            var nxtHiking = nearest(current, hikingPool);
            candidates.splice(candidates.indexOf(nxtHiking), 1);
            route.push(nxtHiking);
            current = nxtHiking;
            continue;
          }
        }
        var nxt = nearest(current, candidates);
        candidates.splice(candidates.indexOf(nxt), 1);
        route.push(nxt);
        current = nxt;
      }

      if (route.length < count) {
        warnings.push('可安排景点数量不足：目标 ' + count + ' 个，实际安排 ' + route.length + ' 个');
      }
      if (!route.length) {
        throw new PlanError('没有可安排的景点，请检查「是否爬山」选项与景点库是否冲突');
      }

      return buildLegs(originGeo, destGeo, route, key).then(function (legResult) {
        var legs = legResult[0];
        var legWarnings = legResult[1];
        legWarnings.forEach(function (w) { warnings.push(w); });

        var tl = buildTimeline(originGeo, destGeo, route, legs);
        var timeline = tl[0];
        var totalMinutes = tl[1];
        var travelTotal = tl[2];
        var visitTotal = tl[3];

        if (totalMinutes > MAX_TOTAL_MINUTES) {
          warnings.push('总时长约 ' + totalMinutes + ' 分钟（超过 ' + MAX_TOTAL_MINUTES + ' 分钟），超出一天合理范围');
        }
        if (visitTotal > 0 && travelTotal > visitTotal * TRAVEL_RATIO_WARN) {
          var ratio = travelTotal / visitTotal;
          warnings.push('路上耗时约 ' + travelTotal + ' 分钟，占游玩时长 ' + visitTotal + ' 分钟的 ' + Math.round(ratio * 100) + '%，比例偏高');
        }

        var legsForMap = legs.map(function (leg) {
          return {
            mode: leg.mode,
            from_name: leg.start_name,
            to_name: leg.end_name,
            polyline: (leg.polyline || []).map(function (pt) {
              return [parseFloat(pt[0]), parseFloat(pt[1])];
            })
          };
        });

        var hikingMarkers = [];
        route.forEach(function (p) {
          if (!p.is_hiking) return;
          var members = p.members || [];
          if (members.length) {
            members.forEach(function (memberName) {
              var src = PLACE_BY_NAME[memberName];
              if (src) hikingMarkers.push({ name: src.name, lng: src.lng, lat: src.lat });
            });
          } else {
            hikingMarkers.push({ name: p.name, lng: p.lng, lat: p.lat });
          }
        });

        return {
          origin: originGeo.formatted,
          destination: destGeo.formatted,
          hiking: hikingBool ? '是' : '否',
          count_requested: count,
          spots: route,
          timeline: timeline,
          total_minutes: totalMinutes,
          travel_total: travelTotal,
          visit_total: visitTotal,
          warnings: warnings,
          origin_lng: originGeo.lng,
          origin_lat: originGeo.lat,
          destination_lng: destGeo.lng,
          destination_lat: destGeo.lat,
          legs: legsForMap,
          hiking_markers: hikingMarkers
        };
      });
    });
  }

  // -------------------------------------------------------------------------
  // 导出
  // -------------------------------------------------------------------------
  global.TripEngine = {
    PlanError: PlanError,
    MAIN_URBAN_DISTRICTS: MAIN_URBAN_DISTRICTS,
    WALK_LIMIT_MIN: WALK_LIMIT_MIN,
    BUFFER_FACTOR: BUFFER_FACTOR,
    MAX_TOTAL_MINUTES: MAX_TOTAL_MINUTES,
    TRAVEL_RATIO_WARN: TRAVEL_RATIO_WARN,
    BOAT_MINUTES: BOAT_MINUTES,
    DEFAULT_START_TIME: DEFAULT_START_TIME,
    HTTP_TIMEOUT: HTTP_TIMEOUT,
    CONNECTED_HIKING_MEMBERS: CONNECTED_HIKING_MEMBERS,
    MULTI_CONNECTED_HIKING: MULTI_CONNECTED_HIKING,
    CITY_LOCATIONS: CITY_LOCATIONS,
    DISTRICT_STREET_COMMUNITY: DISTRICT_STREET_COMMUNITY,
    PLACES: PLACES,
    PLACE_BY_NAME: PLACE_BY_NAME,
    PLACE_ALIAS: PLACE_ALIAS,
    haversineKm: haversineKm,
    fmtTime: fmtTime,
    guessZoom: guessZoom,
    matchPlace: matchPlace,
    mergeConnectedHiking: mergeConnectedHiking,
    nearest: nearest,
    greedyOrder: greedyOrder,
    geocode: geocode,
    resolveAddress: resolveAddress,
    parseDirection: parseDirection,
    amapWalking: amapWalking,
    amapDriving: amapDriving,
    estimateWalkMinutes: estimateWalkMinutes,
    estimateDriveMinutes: estimateDriveMinutes,
    buildLegs: buildLegs,
    buildTimeline: buildTimeline,
    simplify: simplify,
    planTrip: planTrip
  };
})(window);
