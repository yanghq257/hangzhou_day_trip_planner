# -*- coding: utf-8 -*-
"""杭州主城区游玩锻炼一日路线规划器 —— 纯规则引擎工具模块。

仅依赖高德 Web 服务 API 与内置景点库，不引入任何大模型。
"""
import math
from urllib.parse import urlencode

import requests

# ---------------------------------------------------------------------------
# 高德 Web 服务 API 端点
# ---------------------------------------------------------------------------
AMAP_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo"
AMAP_WALKING_URL = "https://restapi.amap.com/v3/direction/walking"
AMAP_DRIVING_URL = "https://restapi.amap.com/v3/direction/driving"
AMAP_STATICMAP_URL = "https://restapi.amap.com/v3/staticmap"

# ---------------------------------------------------------------------------
# 规划常量
# ---------------------------------------------------------------------------
MAIN_URBAN_DISTRICTS = {
    "上城区", "拱墅区", "西湖区", "滨江区", "余杭区",
    "萧山区", "临平区", "钱塘区", "下城区", "江干区",
}
WALK_LIMIT_MIN = 40          # 步行超过 40 分钟禁止选用步行
BUFFER_FACTOR = 1.2          # 交通耗时缓冲系数
MAX_TOTAL_MINUTES = 720      # 总时长超过 12 小时给出警告
TRAVEL_RATIO_WARN = 0.8      # 路上耗时 / 游玩时长 超过 0.8 给出警告
BOAT_MINUTES = 30            # 孤岛游船接驳估算耗时（分钟）
DEFAULT_START_TIME = "09:00"
HTTP_TIMEOUT = 10            # 请求高德接口超时（秒）
CONNECTED_HIKING_MEMBERS = ("老和山", "北高峰")  # 连通登山线路成员（按山脊线串联）
# 多组连通登山线路（按山脊线串联）。仅当一组内全部景点均被选中时才合并。
MULTI_CONNECTED_HIKING = [
    ["老和山", "灵峰山", "北高峰"],
    ["北高峰", "美人峰", "龙门山"],
    ["虎跑公园", "贵人阁", "玉皇山"],
    ["五云山", "龙井村"],
    ["龙门山", "棋盘山", "狮峰"],
    ["吉庆山", "天马山", "北高峰"],
]


class PlanError(Exception):
    """规划过程中可预期、可展示给用户的错误。"""


# ---------------------------------------------------------------------------
# 内置地址数据（主城区 -> 街道 -> 小区；供前端三级联动使用）
# ---------------------------------------------------------------------------
# 已知坐标的地点（优先直接使用预存坐标，跳过地理编码）
CITY_LOCATIONS = {
    "中杭府": (120.0770, 30.2830),          # 西湖区蒋村板块
    "武林广场": (120.1620, 30.2790),
    "西湖文化广场": (120.1620, 30.2870),
    "杭州东站": (120.2130, 30.2900),
    "杭州站（城站）": (120.1810, 30.2440),
    "钱江新城市民中心": (120.2120, 30.2460),
    "新城国际花园彩园": (120.2143, 30.2584),  # 上城区钱江新城庆和路69号
    "滨江区政府": (120.2070, 30.2110),
    "拱宸桥": (120.1450, 30.3180),
}

# 主城区三级联动数据：主城区 -> 街道 -> 小区
DISTRICT_STREET_COMMUNITY = {
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
}


# ---------------------------------------------------------------------------
# 内置景点库（杭州主城区）
# ---------------------------------------------------------------------------
# 字段说明：
#   name             景点名称
#   lng, lat         经纬度
#   is_hiking        是否登山点位
#   visit_minutes    游玩/登山停留分钟
#   is_water_island  是否湖中孤岛（孤岛仅允许游船进出）
#   description      简短介绍
PLACES = [
    # ---- 登山点位 ----
    {"name": "宝石山", "lng": 120.1420, "lat": 30.2590, "is_hiking": True,
     "visit_minutes": 90, "is_water_island": False,
     "description": "西湖边经典登山线，可俯瞰断桥与保俶塔。"},
    {"name": "北高峰", "lng": 120.1110, "lat": 30.2560, "is_hiking": True,
     "visit_minutes": 150, "is_water_island": False,
     "description": "灵隐寺后山，登顶可远眺西溪与西湖。",
     "end_climb_point": "北高峰索道站",
     "end_climb_lng": 120.1068, "end_climb_lat": 30.2431},
    {"name": "玉皇山", "lng": 120.1390, "lat": 30.2140, "is_hiking": True,
     "visit_minutes": 120, "is_water_island": False,
     "description": "西湖群山东侧，道教文化与江湖汇观景致。"},
    {"name": "南高峰", "lng": 120.1080, "lat": 30.2180, "is_hiking": True,
     "visit_minutes": 60, "is_water_island": False,
     "description": "西湖群山南侧高点，茶园与登高观景结合。"},
    {"name": "老和山", "lng": 120.1190, "lat": 30.2650, "is_hiking": True,
     "visit_minutes": 40, "is_water_island": False,
     "description": "城西轻量级登山点，适合短时间锻炼。"},
    {"name": "凤凰山", "lng": 120.1500, "lat": 30.2250, "is_hiking": True,
     "visit_minutes": 45, "is_water_island": False,
     "description": "南宋皇城遗址所在，人文与山林步道结合。"},
    {"name": "九曜山", "lng": 120.1260, "lat": 30.2100, "is_hiking": True,
     "visit_minutes": 35, "is_water_island": False,
     "description": "西湖西南角小山，可望苏堤与雷峰塔。"},
    {"name": "半山国家森林公园", "lng": 120.1770, "lat": 30.3500, "is_hiking": True,
     "visit_minutes": 150, "is_water_island": False,
     "description": "城北森林公园，适合半天登山徒步。"},
    {"name": "皋亭山", "lng": 120.2100, "lat": 30.3600, "is_hiking": True,
     "visit_minutes": 60, "is_water_island": False,
     "description": "城东北登山点，可俯瞰丁桥与半山。"},
    {"name": "马家坞", "lng": 120.1111, "lat": 30.2590, "is_hiking": True,
     "visit_minutes": 90, "is_water_island": False,
     "description": "马家坞观景台（纳福云台），俯瞰西湖与杭城，与北高峰山脊线相连。",
     "type": "登山",
     "start_climb_point": "马家坞牌坊",
     "start_climb_lng": 120.1001, "start_climb_lat": 30.2574,
     "hiking_route_desc": "马家坞村口沿石阶上山，经纳福云台后接入西湖群山西山游步道",
     "end_climb_point": "北高峰",
     "hiking_duration_min": 75},

    # ---- 观光 / 徒步 / 人文 ----
    {"name": "西湖断桥", "lng": 120.1510, "lat": 30.2590, "is_hiking": False,
     "visit_minutes": 40, "is_water_island": False,
     "description": "白堤起点，西湖最经典的临水观景点。"},
    {"name": "苏堤", "lng": 120.1280, "lat": 30.2200, "is_hiking": False,
     "visit_minutes": 120, "is_water_island": False,
     "description": "横贯西湖的长堤，适合步行或骑行观景。"},
    {"name": "太子湾公园", "lng": 120.1280, "lat": 30.2150, "is_hiking": False,
     "visit_minutes": 60, "is_water_island": False,
     "description": "以郁金香与溪流草坪闻名的城市公园。"},
    {"name": "花港观鱼", "lng": 120.1350, "lat": 30.2180, "is_hiking": False,
     "visit_minutes": 60, "is_water_island": False,
     "description": "西湖十景之一，观鱼与园林景观结合。"},
    {"name": "曲院风荷", "lng": 120.1260, "lat": 30.2500, "is_hiking": False,
     "visit_minutes": 60, "is_water_island": False,
     "description": "西湖十景之一，夏日荷花景观。"},
    {"name": "玉泉", "lng": 120.1210, "lat": 30.2542, "is_hiking": False,
     "visit_minutes": 45, "is_water_island": False,
     "description": "杭州植物园内「玉泉鱼跃」，观鱼与园林景观结合。",
     "type": "观光", "tags": ["观鱼", "植物园", "园林"]},
    {"name": "灵隐飞来峰", "lng": 120.1010, "lat": 30.2400, "is_hiking": False,
     "visit_minutes": 120, "is_water_island": False,
     "description": "千年古刹与石窟造像，人文底蕴深厚。"},
    {"name": "龙井村", "lng": 120.1080, "lat": 30.2220, "is_hiking": False,
     "visit_minutes": 90, "is_water_island": False,
     "description": "龙井茶核心产区，茶园与村落观光。"},
    {"name": "九溪烟树", "lng": 120.0990, "lat": 30.1870, "is_hiking": False,
     "visit_minutes": 90, "is_water_island": False,
     "description": "九溪十八涧，溪流与林木相映。"},
    {"name": "云栖竹径", "lng": 120.0780, "lat": 30.1730, "is_hiking": False,
     "visit_minutes": 90, "is_water_island": False,
     "description": "竹林幽径，清幽避暑的徒步路线。"},
    {"name": "西溪湿地", "lng": 120.0660, "lat": 30.2690, "is_hiking": False,
     "visit_minutes": 120, "is_water_island": False,
     "description": "城市湿地公园，水网与自然生态景观。"},
    {"name": "河坊街", "lng": 120.1660, "lat": 30.2400, "is_hiking": False,
     "visit_minutes": 90, "is_water_island": False,
     "description": "杭州历史文化街区，小吃与老字号集中。"},
    {"name": "南宋御街", "lng": 120.1680, "lat": 30.2450, "is_hiking": False,
     "visit_minutes": 60, "is_water_island": False,
     "description": "南宋都城御道，骑楼建筑与步行街。"},
    {"name": "吴山广场", "lng": 120.1620, "lat": 30.2390, "is_hiking": False,
     "visit_minutes": 60, "is_water_island": False,
     "description": "老城区休闲广场，紧邻河坊街与吴山。"},
    {"name": "雷峰塔", "lng": 120.1450, "lat": 30.2300, "is_hiking": False,
     "visit_minutes": 60, "is_water_island": False,
     "description": "西湖十景「雷峰夕照」，登塔俯瞰西湖。"},
    {"name": "岳王庙", "lng": 120.1320, "lat": 30.2550, "is_hiking": False,
     "visit_minutes": 45, "is_water_island": False,
     "description": "纪念岳飞的祠庙，位于北山街。"},
    {"name": "钱江新城城市阳台", "lng": 120.2100, "lat": 30.2450, "is_hiking": False,
     "visit_minutes": 45, "is_water_island": False,
     "description": "钱塘江畔城市观景平台，可看灯光秀。"},
    {"name": "湘湖", "lng": 120.2300, "lat": 30.1450, "is_hiking": False,
     "visit_minutes": 90, "is_water_island": False,
     "description": "杭州南部湖泊景区，湖光山色较西湖更清静。"},
    {"name": "拱宸桥", "lng": 120.1310, "lat": 30.3210, "is_hiking": False,
     "visit_minutes": 60, "is_water_island": False,
     "description": "京杭大运河杭州段标志性古桥与历史街区。"},

    # ---- 湖中孤岛（仅允许游船进出） ----
    {"name": "三潭印月", "lng": 120.1450, "lat": 30.2350, "is_hiking": False,
     "visit_minutes": 60, "is_water_island": True,
     "description": "西湖湖中岛，一元纸币背面图案取景地，需游船前往。"},
    {"name": "湖心亭", "lng": 120.1480, "lat": 30.2400, "is_hiking": False,
     "visit_minutes": 45, "is_water_island": True,
     "description": "西湖湖心小岛，需游船前往。"},
    {"name": "阮公墩", "lng": 120.1400, "lat": 30.2420, "is_hiking": False,
     "visit_minutes": 45, "is_water_island": True,
     "description": "西湖湖中岛，环境清幽，需游船前往。"},
    {"name": "虎跑公园", "lng": 120.1378, "lat": 30.2045, "is_hiking": True,
     "visit_minutes": 60, "is_water_island": False,
     "description": "虎跑梦泉，西湖新十景之一，以虎跑泉水、济公传说和山林步道闻名"},

    # ---------- 新增登山点位 ----------
    {"name": "吴山", "lng": 120.1600, "lat": 30.2370, "is_hiking": True,
     "visit_minutes": 90, "is_water_island": False,
     "description": "吴山天风，老城山体，城隍阁俯瞰杭州老城，适合轻登山。",
     "start_climb_point": "吴山广场", "start_climb_lng": 120.1620, "start_climb_lat": 30.2390,
     "end_climb_point": "河坊街出口", "end_climb_lng": 120.1640, "end_climb_lat": 30.2400,
     "hiking_duration_min": 70},

    {"name": "冠山公园", "lng": 120.1440, "lat": 30.1820, "is_hiking": True,
     "visit_minutes": 80, "is_water_island": False,
     "description": "滨江区冠山，山顶可眺望钱塘江与滨江城区，难度轻松。",
     "start_climb_point": "冠山公园南入口", "start_climb_lng": 120.1432, "start_climb_lat": 30.1805,
     "end_climb_point": "冠山北出口", "end_climb_lng": 120.1451, "end_climb_lat": 30.1833,
     "hiking_duration_min": 60},

    {"name": "龙坞茶镇", "lng": 120.0320, "lat": 30.2210, "is_hiking": True,
     "visit_minutes": 120, "is_water_island": False,
     "description": "万亩龙井茶园，光明寺水库，平缓茶山徒步，适合休闲登山。",
     "start_climb_point": "龙坞何家村市集", "start_climb_lng": 120.0301, "start_climb_lat": 30.2202,
     "end_climb_point": "光明寺水库出口", "end_climb_lng": 120.0344, "end_climb_lat": 30.2235,
     "hiking_duration_min": 90},

    {"name": "灵峰山", "lng": 120.1040, "lat": 30.2610, "is_hiking": True,
     "visit_minutes": 70, "is_water_island": False,
     "description": "十里龙脊山脊节点，连接老和山、美人峰至北高峰，山林清幽。",
     "start_climb_point": "老和云起步道口", "start_climb_lng": 120.1180, "start_climb_lat": 30.2640,
     "end_climb_point": "北高峰方向石人亭岔口", "end_climb_lng": 120.1020, "end_climb_lat": 30.2580,
     "hiking_duration_min": 55},

    {"name": "美人峰", "lng": 120.0960, "lat": 30.2540, "is_hiking": True,
     "visit_minutes": 75, "is_water_island": False,
     "description": "十里龙脊主要山峰，视野开阔，可远眺西溪与西湖。",
     "start_climb_point": "北高峰财神庙后山步道", "start_climb_lng": 120.1070, "start_climb_lat": 30.2550,
     "end_climb_point": "龙门山方向山脊岔口", "end_climb_lng": 120.0920, "end_climb_lat": 30.2510,
     "hiking_duration_min": 60},

    {"name": "龙门山", "lng": 120.0860, "lat": 30.2480, "is_hiking": True,
     "visit_minutes": 80, "is_water_island": False,
     "description": "西山十里龙脊西段高峰，山林野趣，通往石人亭、法喜寺下撤口。",
     "start_climb_point": "美人峰山脊过来岔口", "start_climb_lng": 120.0910, "start_climb_lat": 30.2500,
     "end_climb_point": "石人亭下撤天竺方向", "end_climb_lng": 120.0820, "end_climb_lat": 30.2440,
     "hiking_duration_min": 65},

    {"name": "五云山", "lng": 120.0820, "lat": 30.2040, "is_hiking": True,
     "visit_minutes": 100, "is_water_island": False,
     "description": "十里琅珰起点，真际寺古树，下山可达九溪烟树。",
     "start_climb_point": "九溪烟树登山口", "start_climb_lng": 120.0980, "start_climb_lat": 30.1880,
     "end_climb_point": "十里琅珰龙井村出口", "end_climb_lng": 120.0860, "end_climb_lat": 30.2120,
     "hiking_duration_min": 85},

    {"name": "贵人阁", "lng": 120.1340, "lat": 30.2080, "is_hiking": True,
     "visit_minutes": 60, "is_water_island": False,
     "description": "虎跑后山观景制高点，同时看西湖与钱塘江，可连通玉皇山环线。",
     "start_climb_point": "虎跑公园后山入口", "start_climb_lng": 120.1370, "start_climb_lat": 30.2030,
     "end_climb_point": "玉皇山慈云岭方向出口", "end_climb_lng": 120.1380, "end_climb_lat": 30.2130,
     "hiking_duration_min": 45},

    {"name": "如意尖", "lng": 120.0010, "lat": 30.2060, "is_hiking": True,
     "visit_minutes": 150, "is_water_island": False,
     "description": "杭州城西最高峰，西山百里如意景观带核心，山野长距离徒步。",
     "start_climb_point": "大岭村登山入口", "start_climb_lng": 119.9940, "start_climb_lat": 30.2020,
     "end_climb_point": "板壁山水库下撤口", "end_climb_lng": 120.0060, "end_climb_lat": 30.2100,
     "hiking_duration_min": 120},

    {"name": "大清谷", "lng": 120.0440, "lat": 30.2460, "is_hiking": True,
     "visit_minutes": 90, "is_water_island": False,
     "description": "西山游步道北段节点，山谷茶园，难度中等，可连接龙坞方向。",
     "start_climb_point": "大清谷景区入口", "start_climb_lng": 120.0410, "start_climb_lat": 30.2430,
     "end_climb_point": "龙坞方向游步道岔口", "end_climb_lng": 120.0480, "end_climb_lat": 30.2490,
     "hiking_duration_min": 70},

    {"name": "北观音洞", "lng": 120.1220, "lat": 30.2430, "is_hiking": True,
     "visit_minutes": 50, "is_water_island": False,
     "description": "灵隐周边山体，石窟遗迹，连接吉庆山，短途登山。",
     "start_climb_point": "灵隐飞来峰西侧山道", "start_climb_lng": 120.1170, "start_climb_lat": 30.2410,
     "end_climb_point": "吉庆山山脊岔口", "end_climb_lng": 120.1240, "end_climb_lat": 30.2460,
     "hiking_duration_min": 40},

    {"name": "天马山", "lng": 120.1140, "lat": 30.2490, "is_hiking": True,
     "visit_minutes": 60, "is_water_island": False,
     "description": "灵隐后方山体，连接吉庆山与北高峰，西山游步道节点。",
     "start_climb_point": "北观音洞山脊过来岔口", "start_climb_lng": 120.1230, "start_climb_lat": 30.2470,
     "end_climb_point": "北高峰南侧山道出口", "end_climb_lng": 120.1120, "end_climb_lat": 30.2530,
     "hiking_duration_min": 48},

    {"name": "吉庆山", "lng": 120.1280, "lat": 30.2450, "is_hiking": True,
     "visit_minutes": 55, "is_water_island": False,
     "description": "西湖西侧山体，毗邻灵隐，可串天马山-北高峰。",
     "start_climb_point": "杨公堤郭庄后山入口", "start_climb_lng": 120.1310, "start_climb_lat": 30.2480,
     "end_climb_point": "北观音洞方向山脊岔口", "end_climb_lng": 120.1210, "end_climb_lat": 30.2420,
     "hiking_duration_min": 42},

    {"name": "棋盘山", "lng": 120.0920, "lat": 30.2260, "is_hiking": True,
     "visit_minutes": 70, "is_water_island": False,
     "description": "十里琅珰中段制高点，连接龙门山、狮峰，茶园环绕。",
     "start_climb_point": "龙门山南侧下山步道", "start_climb_lng": 120.0870, "start_climb_lat": 30.2290,
     "end_climb_point": "狮峰龙井方向岔口", "end_climb_lng": 120.0960, "end_climb_lat": 30.2220,
     "hiking_duration_min": 52},

    {"name": "狮峰", "lng": 120.0980, "lat": 30.2190, "is_hiking": True,
     "visit_minutes": 65, "is_water_island": False,
     "description": "狮峰龙井核心产区，十里琅珰必经点位，茶园观景。",
     "start_climb_point": "棋盘山过来山脊", "start_climb_lng": 120.0950, "start_climb_lat": 30.2230,
     "end_climb_point": "龙井村下山出口", "end_climb_lng": 120.1020, "end_climb_lat": 30.2160,
     "hiking_duration_min": 48},

    {"name": "白鹤峰", "lng": 120.1000, "lat": 30.2340, "is_hiking": True,
     "visit_minutes": 60, "is_water_island": False,
     "description": "天竺群山，俯瞰灵隐寺院群，短途徒步。",
     "start_climb_point": "法喜寺后山入口", "start_climb_lng": 120.0840, "start_climb_lat": 30.2320,
     "end_climb_point": "棋盘山北向山道岔口", "end_climb_lng": 120.0970, "end_climb_lat": 30.2360,
     "hiking_duration_min": 45},

    {"name": "桃桂山", "lng": 120.1080, "lat": 30.2510, "is_hiking": True,
     "visit_minutes": 45, "is_water_island": False,
     "description": "北高峰南侧小山，连接天马山，灵隐上山的过渡山体。",
     "start_climb_point": "天马山北下口", "start_climb_lng": 120.1130, "start_climb_lat": 30.2480,
     "end_climb_point": "北高峰南坡步道", "end_climb_lng": 120.1090, "end_climb_lat": 30.2540,
     "hiking_duration_min": 35},

    {"name": "九华山(转塘)", "lng": 120.0480, "lat": 30.1900, "is_hiking": True,
     "visit_minutes": 95, "is_water_island": False,
     "description": "转塘九华山，临近龙坞，茶山与山林结合，人少清静。",
     "start_climb_point": "转塘九华村登山口", "start_climb_lng": 120.0440, "start_climb_lat": 30.1870,
     "end_climb_point": "龙坞游步道西南岔口", "end_climb_lng": 120.0510, "end_climb_lat": 30.1930,
     "hiking_duration_min": 72},

    {"name": "石岩山", "lng": 120.2720, "lat": 30.1210, "is_hiking": True,
     "visit_minutes": 85, "is_water_island": False,
     "description": "萧山石岩山，一览湘湖全景，湘湖周边登山。",
     "start_climb_point": "石岩山东门登山口", "start_climb_lng": 120.2700, "start_climb_lat": 30.1180,
     "end_climb_point": "石岩山西侧下湘湖出口", "end_climb_lng": 120.2740, "end_climb_lat": 30.1240,
     "hiking_duration_min": 62},

    {"name": "望宸阁", "lng": 120.1740, "lat": 30.3530, "is_hiking": True,
     "visit_minutes": 70, "is_water_island": False,
     "description": "半山国家森林公园制高点望宸阁，城北登高俯瞰杭城。",
     "start_climb_point": "半山公园主入口", "start_climb_lng": 120.1790, "start_climb_lat": 30.3480,
     "end_climb_point": "虎山公园下撤口", "end_climb_lng": 120.1710, "end_climb_lat": 30.3570,
     "hiking_duration_min": 50},

    # ---------- 新增人文/观光点位 ----------
    {"name": "孤山公园", "lng": 120.1400, "lat": 30.2510, "is_hiking": False,
     "visit_minutes": 70, "is_water_island": False,
     "description": "西湖孤山，浙江博物馆孤山馆、西泠印社，湖山人文一体。"},

    {"name": "柳浪闻莺", "lng": 120.1540, "lat": 30.2340, "is_hiking": False,
     "visit_minutes": 60, "is_water_island": False,
     "description": "西湖十景，南宋御花园，垂柳湖滨大草坪。"},

    {"name": "茅家埠", "lng": 120.1160, "lat": 30.2360, "is_hiking": False,
     "visit_minutes": 75, "is_water_island": False,
     "description": "西湖小众水域，野趣湖岸，人少静谧。"},

    {"name": "德寿宫", "lng": 120.1680, "lat": 30.2420, "is_hiking": False,
     "visit_minutes": 90, "is_water_island": False,
     "description": "南宋德寿宫遗址，红墙网红打卡，宋代宫殿遗址。"},

    {"name": "城隍阁", "lng": 120.1605, "lat": 30.2378, "is_hiking": False,
     "visit_minutes": 60, "is_water_island": False,
     "description": "吴山之巅楼阁，登高俯瞰杭州老城全景。"},

    {"name": "万松书院", "lng": 120.1470, "lat": 30.2280, "is_hiking": False,
     "visit_minutes": 60, "is_water_island": False,
     "description": "古代杭州最高学府，梁山伯祝英台传说，周末相亲角。"},

    {"name": "六和塔", "lng": 120.1320, "lat": 30.1920, "is_hiking": False,
     "visit_minutes": 70, "is_water_island": False,
     "description": "钱塘江畔千年古塔，登塔眺望钱塘江大桥。"},

    {"name": "法喜寺", "lng": 120.0830, "lat": 30.2330, "is_hiking": False,
     "visit_minutes": 90, "is_water_island": False,
     "description": "上天竺法喜讲寺，网红寺庙，求姻缘，山林禅院。"},

    {"name": "香积寺", "lng": 120.1410, "lat": 30.3070, "is_hiking": False,
     "visit_minutes": 60, "is_water_island": False,
     "description": "京杭大运河旁古寺，素斋知名。"},

    {"name": "小河直街", "lng": 120.1430, "lat": 30.3120, "is_hiking": False,
     "visit_minutes": 70, "is_water_island": False,
     "description": "运河历史街区，文艺咖啡馆，老民居风貌。"},
]

PLACE_BY_NAME = {p["name"]: p for p in PLACES}

# 别名映射：将用户输入的口语化别名替换为景点库标准名称后再检索
PLACE_ALIAS = {
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
    "棋盘山十里琅珰": "棋盘山",
}


# ---------------------------------------------------------------------------
# 基础工具
# ---------------------------------------------------------------------------
def haversine_km(lng1, lat1, lng2, lat2):
    """两点间球面距离（公里）。"""
    r = 6371.0
    lng1, lat1, lng2, lat2 = map(math.radians, [lng1, lat1, lng2, lat2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _http_get_json(url, params):
    """请求高德接口并返回 JSON，失败抛出 PlanError。"""
    try:
        resp = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as exc:
        raise PlanError(f"高德接口请求失败：{exc}")
    except ValueError as exc:
        raise PlanError(f"高德接口返回解析失败：{exc}")


def _fmt_time(minutes):
    """把距 0 点的分钟数格式化为 HH:MM。"""
    minutes = int(minutes) % (24 * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _guess_zoom(diag_km):
    """根据点位分布范围估算静态地图缩放级别。"""
    if diag_km < 3:
        return 15
    if diag_km < 6:
        return 14
    if diag_km < 12:
        return 13
    if diag_km < 25:
        return 12
    if diag_km < 50:
        return 11
    return 10


# ---------------------------------------------------------------------------
# 高德 API 封装
# ---------------------------------------------------------------------------
def geocode(address, key):
    """地理编码（自动补全杭州市前缀），并校验属于杭州市（主城区仅软提示）。失败抛出 PlanError。"""
    if not key:
        raise PlanError("请先填写高德 API Key")

    # 自动补全杭州市前缀，便于小区/地点名直接定位；已带前缀则不重复拼接
    addr = (address or "").strip()
    if addr and not addr.startswith("杭州市"):
        addr = "杭州市" + addr

    try:
        data = _http_get_json(AMAP_GEOCODE_URL, {"address": addr, "key": key})
    except PlanError:
        raise PlanError("地址解析失败，请检查地址是否正确")
    if data.get("status") != "1" or not data.get("geocodes"):
        raise PlanError("地址解析失败，请检查地址是否正确")

    g = data["geocodes"][0]
    loc = (g.get("location") or "").split(",")
    if len(loc) != 2:
        raise PlanError(f"地址解析结果缺少坐标：{address}")
    try:
        lng, lat = float(loc[0]), float(loc[1])
    except ValueError:
        raise PlanError(f"地址坐标格式异常：{address}")

    geo = {
        "formatted": g.get("formatted_address") or address,
        "lng": lng,
        "lat": lat,
        "province": g.get("province") or "",
        "city": g.get("city") or "",
        "district": g.get("district") or "",
        "adcode": str(g.get("adcode") or ""),
    }

    if geo["city"] != "杭州市":
        raise PlanError("该地址不在杭州市范围内，请重新填写")
    if geo["district"] and geo["district"] not in MAIN_URBAN_DISTRICTS:
        geo["warning"] = "该地点不在传统主城区，通勤距离较长"
    return geo


def resolve_address(address, key):
    """解析出发/返回地址坐标。

    优先匹配 CITY_LOCATIONS 预存坐标（跳过地理编码与行政区校验）；
    否则走原有高德地理编码流程。
    """
    addr = (address or "").strip()
    if addr in CITY_LOCATIONS:
        lng, lat = CITY_LOCATIONS[addr]
        return {
            "formatted": addr,
            "lng": lng,
            "lat": lat,
            "province": "浙江省",
            "city": "杭州市",
            "district": "",
            "adcode": "330100",
        }
    return geocode(addr, key)


def _parse_direction(resp):
    """解析步行/驾车路径规划响应，返回 {duration_min, polyline}。"""
    route = resp.get("route") or {}
    paths = route.get("paths") or []
    if not paths:
        return None
    first = paths[0]
    seconds = first.get("duration")
    if seconds is None:
        return None
    minutes = max(1, int(round(float(seconds) / 60.0)))
    polyline = []
    for step in first.get("steps") or []:
        pl = step.get("polyline") or ""
        for pair in pl.split(";"):
            pair = pair.strip()
            if not pair or "," not in pair:
                continue
            try:
                x, y = pair.split(",", 1)
                polyline.append((float(x), float(y)))
            except ValueError:
                continue
    return {"duration_min": minutes, "polyline": polyline}


def amap_walking(lng1, lat1, lng2, lat2, key):
    """步行路径规划，失败返回 None（由调用方降级估算）。"""
    try:
        data = _http_get_json(AMAP_WALKING_URL, {
            "origin": f"{lng1},{lat1}",
            "destination": f"{lng2},{lat2}",
            "key": key,
        })
        if data.get("status") != "1":
            return None
        return _parse_direction(data)
    except PlanError:
        return None


def amap_driving(lng1, lat1, lng2, lat2, key):
    """驾车路径规划，失败返回 None（由调用方降级估算）。"""
    try:
        data = _http_get_json(AMAP_DRIVING_URL, {
            "origin": f"{lng1},{lat1}",
            "destination": f"{lng2},{lat2}",
            "strategy": 0,
            "key": key,
        })
        if data.get("status") != "1":
            return None
        return _parse_direction(data)
    except PlanError:
        return None


def _estimate_walk_minutes(km):
    """步行耗时兜底估算（约 4.5 km/h）。"""
    return max(1, int(round(km / 4.5 * 60)))


def _estimate_drive_minutes(km):
    """驾车耗时兜底估算（约 25 km/h + 起步缓冲）。"""
    return max(1, int(round(km / 25.0 * 60 + 5)))


# ---------------------------------------------------------------------------
# 景点匹配与路线构建
# ---------------------------------------------------------------------------
def match_place(query):
    """按名称匹配内置景点库；识别不到返回 None。"""
    q = (query or "").strip()
    if not q:
        return None
    # 别名归一化：口语别名先替换为标准景点名，再进入后续检索
    q = PLACE_ALIAS.get(q, q)
    if q in PLACE_BY_NAME:
        return PLACE_BY_NAME[q]
    for p in PLACES:
        if q in p["name"] or (len(q) >= 2 and p["name"] in q):
            return p
    return None


def _merge_connected_hiking(spots):
    """合并连通登山线路为单一虚拟节点。

    优先循环处理 MULTI_CONNECTED_HIKING 中配置的多组山脊线路，仅当一整组
    景点全部被选中时才触发合并；处理完多组后再执行既有「老和山 → 北高峰」
    逻辑作为兜底兼容。部分选中组内景点时保持独立景点，不触发合并。
    """
    result = list(spots)

    def merge_group(group):
        """若 group 内全部景点都在 result 中，则替换为一个合并节点。"""
        names = [p["name"] for p in result]
        if not all(m in names for m in group):
            return
        members = [next(p for p in result if p["name"] == m) for m in group]
        merged = {
            "name": " → ".join(group) + "，连续登山线路",
            "lng": round(sum(m["lng"] for m in members) / len(members), 6),
            "lat": round(sum(m["lat"] for m in members) / len(members), 6),
            "is_hiking": True,
            "visit_minutes": int(sum(m["visit_minutes"] for m in members)),
            "is_water_island": False,
            "description": "沿西湖群山西山游步道连续穿越" + "、".join(group) + "，山脊线串联徒步登山。",
            "connected_hiking": True,
            "members": list(group),
        }
        out, inserted = [], False
        for p in result:
            if p["name"] in group:
                if not inserted:
                    out.append(merged)
                    inserted = True
                continue
            out.append(p)
        result[:] = out

    for group in MULTI_CONNECTED_HIKING:
        merge_group(group)

    # 兜底兼容：老和山 → 北高峰 连续登山线路
    names = [p["name"] for p in result]
    if all(m in names for m in CONNECTED_HIKING_MEMBERS):
        a = next(p for p in result if p["name"] == CONNECTED_HIKING_MEMBERS[0])
        b = next(p for p in result if p["name"] == CONNECTED_HIKING_MEMBERS[1])
        merged = {
            "name": "老和山 → 北高峰，连续登山线路",
            "lng": round((a["lng"] + b["lng"]) / 2, 6),
            "lat": round((a["lat"] + b["lat"]) / 2, 6),
            "is_hiking": True,
            "visit_minutes": int(a["visit_minutes"]) + int(b["visit_minutes"]),
            "is_water_island": False,
            "description": "沿西湖群山西山游步道连续穿越老和山至北高峰，可远眺西溪湿地与西湖。",
            "connected_hiking": True,
            "members": list(CONNECTED_HIKING_MEMBERS),
        }
        out, inserted = [], False
        for p in result:
            if p["name"] in CONNECTED_HIKING_MEMBERS:
                if not inserted:
                    out.append(merged)
                    inserted = True
                continue
            out.append(p)
        result = out

    return result


def _nearest(current, candidates):
    """从候选中找出离 current 最近的点。"""
    best, best_d = None, None
    for c in candidates:
        d = haversine_km(current["lng"], current["lat"], c["lng"], c["lat"])
        if best_d is None or d < best_d:
            best, best_d = c, d
    return best


def _greedy_order(start_geo, places):
    """最近邻贪心排序。"""
    result, current = [], start_geo
    remaining = list(places)
    while remaining:
        nxt = _nearest(current, remaining)
        result.append(nxt)
        remaining.remove(nxt)
        current = nxt
    return result


def build_legs(origin_geo, dest_geo, route, key):
    """构建交通段，并返回 (legs, warnings)。"""
    points = [origin_geo] + list(route) + [dest_geo]
    legs, warnings = [], []

    for i in range(len(points) - 1):
        start, end = points[i], points[i + 1]
        start_name = start.get("name") or start.get("formatted") or "出发地"
        end_name = end.get("name") or end.get("formatted") or "目的地"
        start_island = bool(start.get("is_water_island"))
        end_island = bool(end.get("is_water_island"))

        leg = {
            "start_name": start_name,
            "end_name": end_name,
            "start_island": start_island,
            "end_island": end_island,
        }

        if start_island or end_island:
            # 孤岛只允许游船进出
            leg["mode"] = "游船"
            leg["duration_min"] = BOAT_MINUTES
            leg["polyline"] = [(start["lng"], start["lat"]), (end["lng"], end["lat"])]
        else:
            # 连续相邻两个登山景点：改用下山出口 / 上山起点坐标计算，而非景点中心点
            if bool(start.get("is_hiking")) and bool(end.get("is_hiking")):
                s_lng = start.get("end_climb_lng", start["lng"])
                s_lat = start.get("end_climb_lat", start["lat"])
                e_lng = end.get("start_climb_lng", end["lng"])
                e_lat = end.get("start_climb_lat", end["lat"])
            else:
                s_lng, s_lat = start["lng"], start["lat"]
                e_lng, e_lat = end["lng"], end["lat"]

            km = haversine_km(s_lng, s_lat, e_lng, e_lat)
            walk = amap_walking(s_lng, s_lat, e_lng, e_lat, key)
            walk_min = walk["duration_min"] if walk else _estimate_walk_minutes(km)
            walk_polyline = walk["polyline"] if walk else None

            if walk_min <= WALK_LIMIT_MIN:
                leg["mode"] = "步行"
                leg["duration_min"] = walk_min
                leg["polyline"] = walk_polyline or [(s_lng, s_lat), (e_lng, e_lat)]
            else:
                drive = amap_driving(s_lng, s_lat, e_lng, e_lat, key)
                drive_min = drive["duration_min"] if drive else _estimate_drive_minutes(km)
                drive_polyline = drive["polyline"] if drive else None
                leg["mode"] = "打车"
                leg["duration_min"] = drive_min
                leg["polyline"] = drive_polyline or [(s_lng, s_lat), (e_lng, e_lat)]

        legs.append(leg)

    # 后端兜底风险校验
    for leg in legs:
        if leg["mode"] == "步行" and leg["duration_min"] > WALK_LIMIT_MIN:
            warnings.append(
                f"{leg['start_name']} → {leg['end_name']} 步行约 {leg['duration_min']} 分钟（>40 分钟），存在超长步行"
            )
        if (leg["start_island"] or leg["end_island"]) and leg["mode"] != "游船":
            warnings.append(
                f"{leg['start_name']} → {leg['end_name']} 涉及湖中孤岛，却未使用游船，交通方式非法"
            )

    return legs, warnings


def build_timeline(origin_geo, dest_geo, route, legs):
    """组装完整时间轴，返回 (steps, total_minutes, travel_total, visit_total)。"""
    steps = []
    current = int(DEFAULT_START_TIME.split(":")[0]) * 60 + int(DEFAULT_START_TIME.split(":")[1])
    travel_total, visit_total = 0, 0

    steps.append({
        "类型": "出发",
        "地点": origin_geo.get("formatted") or "出发地",
        "时间": _fmt_time(current),
        "耗时分钟": 0,
    })

    for i, p in enumerate(route):
        leg = legs[i]
        buffered = max(1, math.ceil(leg["duration_min"] * BUFFER_FACTOR))
        travel_total += buffered

        start_t = current
        end_t = current + buffered
        steps.append({
            "类型": "交通",
            "起点": leg["start_name"],
            "终点": leg["end_name"],
            "方式": leg["mode"],
            "耗时分钟": buffered,
            "时间": _fmt_time(start_t),
            "结束时间": _fmt_time(end_t),
        })
        current = end_t

        start_t = current
        end_t = current + int(p["visit_minutes"])
        visit_total += int(p["visit_minutes"])
        steps.append({
            "类型": "活动",
            "地点": p["name"],
            "停留分钟": int(p["visit_minutes"]),
            "描述": p["description"],
            "是否登山": p["is_hiking"],
            "是否孤岛": p["is_water_island"],
            "时间": _fmt_time(start_t),
            "结束时间": _fmt_time(end_t),
        })
        current = end_t

    # 最后一段：最后一个景点返回目的地
    leg = legs[-1]
    buffered = max(1, math.ceil(leg["duration_min"] * BUFFER_FACTOR))
    travel_total += buffered
    start_t, end_t = current, current + buffered
    steps.append({
        "类型": "交通",
        "起点": leg["start_name"],
        "终点": leg["end_name"],
        "方式": leg["mode"],
        "耗时分钟": buffered,
        "时间": _fmt_time(start_t),
        "结束时间": _fmt_time(end_t),
    })
    current = end_t

    steps.append({
        "类型": "到达",
        "地点": dest_geo.get("formatted") or "目的地",
        "时间": _fmt_time(current),
        "耗时分钟": 0,
    })

    start_min = int(DEFAULT_START_TIME.split(":")[0]) * 60 + int(DEFAULT_START_TIME.split(":")[1])
    total_minutes = current - start_min
    return steps, total_minutes, travel_total, visit_total


def _simplify(coords, max_points):
    """抽稀坐标，避免静态地图 URL 过长。"""
    if len(coords) <= max_points:
        return list(coords)
    stride = math.ceil(len(coords) / max_points)
    out = coords[::stride]
    if out[-1] != coords[-1]:
        out.append(coords[-1])
    return out


def build_static_map(origin_geo, dest_geo, route, legs, key):
    """生成带点位标记与轨迹的高德静态地图 URL。"""
    points = [origin_geo] + list(route) + [dest_geo]
    labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

    marker_parts = []
    for idx, p in enumerate(points):
        label = labels[idx] if idx < len(labels) else str(idx)
        marker_parts.append(f"mid,0xFF4500,{label}:{p['lng']},{p['lat']}")
    markers = ";".join(marker_parts)

    coords = []
    for leg in legs:
        pl = leg.get("polyline") or []
        if pl:
            coords.extend(pl)
    if not coords:
        coords = [(p["lng"], p["lat"]) for p in points]
    coords = _simplify(coords, 150)
    paths = "0x3366FF,5,0.8:" + ";".join(f"{lng},{lat}" for lng, lat in coords)

    lngs = [p["lng"] for p in points]
    lats = [p["lat"] for p in points]
    center_lng = (min(lngs) + max(lngs)) / 2
    center_lat = (min(lats) + max(lats)) / 2
    diag = haversine_km(min(lngs), min(lats), max(lngs), max(lats))
    zoom = _guess_zoom(diag)

    key_qs = urlencode({"key": key})
    return (
        f"{AMAP_STATICMAP_URL}?{key_qs}"
        f"&size=750*500&location={center_lng},{center_lat}&zoom={zoom}"
        f"&markers={markers}&paths={paths}"
    )


# ---------------------------------------------------------------------------
# 主规划流程
# ---------------------------------------------------------------------------
def plan_trip(origin_addr, destination_addr, hiking_bool, must_visit_raw, count, key):
    """纯规则引擎规划入口，返回完整方案 dict；失败抛出 PlanError。"""
    if not key:
        raise PlanError("请先填写高德 API Key")

    origin_geo = resolve_address(origin_addr, key)
    dest_geo = resolve_address(destination_addr, key)
    warnings = []

    # 1) 景点池：是否爬山决定是否过滤登山点位
    if hiking_bool:
        pool = list(PLACES)
    else:
        pool = [p for p in PLACES if not p["is_hiking"]]

    # 2) 必去景点：强制保留，作为骨架
    must_include, unmatched = [], []
    for raw in must_visit_raw:
        raw = (raw or "").strip()
        if not raw:
            continue
        p = match_place(raw)
        if p is None:
            unmatched.append(raw)
            continue
        if (not hiking_bool) and p["is_hiking"]:
            warnings.append(f"必去景点「{p['name']}」为登山点位，与「不爬山」冲突，已忽略")
            continue
        if p["name"] not in [m["name"] for m in must_include]:
            must_include.append(p)
    for name in unmatched:
        warnings.append(f"未能识别必去景点「{name}」，已忽略")

    # 连通登山线路：登山模式下同时勾选老和山与北高峰时，合并为一条连续登山节点
    if hiking_bool:
        must_include = _merge_connected_hiking(must_include)

    # 3) 骨架排序 + 最近邻贪心补充
    route = _greedy_order(origin_geo, must_include)
    included = {p["name"] for p in route}
    # 连通登山线路的成员点位视为已纳入，避免贪心补充时重复加入
    for p in route:
        for member_name in p.get("members") or []:
            included.add(member_name)
    candidates = [p for p in pool if p["name"] not in included]
    current = route[-1] if route else origin_geo

    while len(route) < count and candidates:
        # 爬山=是 且 尚未纳入登山点，则优先补充登山点，保证形成登山路线
        if hiking_bool and not any(p["is_hiking"] for p in route):
            hiking_pool = [p for p in candidates if p["is_hiking"]]
            if hiking_pool:
                nxt = _nearest(current, hiking_pool)
                candidates.remove(nxt)
                route.append(nxt)
                current = nxt
                continue
        nxt = _nearest(current, candidates)
        candidates.remove(nxt)
        route.append(nxt)
        current = nxt

    if len(route) < count:
        warnings.append(f"可安排景点数量不足：目标 {count} 个，实际安排 {len(route)} 个")

    if not route:
        raise PlanError("没有可安排的景点，请检查「是否爬山」选项与景点库是否冲突")

    # 4) 交通段
    legs, leg_warnings = build_legs(origin_geo, dest_geo, route, key)
    warnings.extend(leg_warnings)

    # 5) 时间轴
    timeline, total_minutes, travel_total, visit_total = build_timeline(
        origin_geo, dest_geo, route, legs
    )

    # 6) 风险校验
    if total_minutes > MAX_TOTAL_MINUTES:
        warnings.append(
            f"总时长约 {total_minutes} 分钟（超过 {MAX_TOTAL_MINUTES} 分钟），超出一天合理范围"
        )
    if visit_total > 0 and travel_total > visit_total * TRAVEL_RATIO_WARN:
        ratio = travel_total / visit_total
        warnings.append(
            f"路上耗时约 {travel_total} 分钟，占游玩时长 {visit_total} 分钟的 {ratio:.0%}，比例偏高"
        )

    # 7) 静态地图
    static_map_url = build_static_map(origin_geo, dest_geo, route, legs, key)

    # 8) 导出前端动态地图所需字段（仅组装已计算结果，不改变规划逻辑、不重复调接口）
    legs_for_map = [
        {
            "mode": leg["mode"],
            "from_name": leg["start_name"],
            "to_name": leg["end_name"],
            "polyline": [[float(x), float(y)] for x, y in (leg.get("polyline") or [])],
        }
        for leg in legs
    ]
    # 景点库暂无上下口坐标，暂用景点自身坐标作为登山点位标记；
    # 连通登山线路展开为其成员点位，保留老和山、北高峰两个标记
    hiking_markers = []
    for p in route:
        if not p.get("is_hiking"):
            continue
        members = p.get("members") or []
        if members:
            for member_name in members:
                src = PLACE_BY_NAME.get(member_name)
                if src:
                    hiking_markers.append({
                        "name": src["name"],
                        "lng": src["lng"],
                        "lat": src["lat"],
                    })
        else:
            hiking_markers.append({"name": p["name"], "lng": p["lng"], "lat": p["lat"]})

    return {
        "origin": origin_geo["formatted"],
        "destination": dest_geo["formatted"],
        "hiking": "是" if hiking_bool else "否",
        "count_requested": count,
        "spots": route,
        "timeline": timeline,
        "total_minutes": total_minutes,
        "travel_total": travel_total,
        "visit_total": visit_total,
        "warnings": warnings,
        "static_map_url": static_map_url,
        "origin_lng": origin_geo["lng"],
        "origin_lat": origin_geo["lat"],
        "destination_lng": dest_geo["lng"],
        "destination_lat": dest_geo["lat"],
        "legs": legs_for_map,
        "hiking_markers": hiking_markers,
    }
