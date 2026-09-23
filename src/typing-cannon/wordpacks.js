// @ts-check
"use strict";
/* ==================== 词包数据（契约 CON-TC001，本文件落地后即最终事实来源） ====================
   结构：window.WordPacks = [包]
   包：{ id, name, icon, tone: 'kid'|'adult', desc, levels: [关卡] }
   关卡：{ name, icon, fall 掉落速度px/s, spawn 出生间隔秒, goal 过关词数,
          direction: 'copy'(显示英文抄写) | 'recall'(显示中文释义回忆拼写), words: [词元] }
   词元：{ w 单词(小写), emoji 图标(recall 关为 null), ipa 音标(recall 关必填), zh 中文释义(recall 关必填) }
   约束：包内唯一与同关首字母唯一均仅约束 recall 关（盲打场景不允许锁定歧义）；
        copy 关单词可见，沿用历史数据允许同首字母，玩家可点击气泡手动切换锁定目标；
        smoke.test.js 按上述规则做构建期校验。 */
(function () {
  /* 词元速写：copy 关 (w, emoji)；recall 关 (w, null, ipa, zh) */
  function w(word, emoji, ipa, zh) {
    return { w: word, emoji: emoji || null, ipa: ipa || null, zh: zh || null };
  }

  /* ---- 儿童词包：原 12 个主题关卡整体迁移（行为与拆分前一致） ---- */
  const kidLevels = [
    { name: '短词热身', icon: '🌱', fall: 32, spawn: 3.2, goal: 8, direction: 'copy', words: [
      w('egg','🥚'), w('cat','🐱'), w('dog','🐶'), w('sun','☀️'), w('bus','🚌'), w('hat','🎩'), w('key','🔑'), w('cup','☕') ] },
    { name: '天天见', icon: '🌟', fall: 36, spawn: 3.0, goal: 8, direction: 'copy', words: [
      w('star','⭐'), w('fish','🐟'), w('book','📕'), w('ball','⚽'), w('moon','🌙'), w('tree','🌳'), w('bird','🐦'), w('milk','🥛') ] },
    { name: '水果派对', icon: '🍎', fall: 40, spawn: 2.9, goal: 8, direction: 'copy', words: [
      w('apple','🍎'), w('orange','🍊'), w('lemon','🍋'), w('grape','🍇'), w('cherry','🍒'), w('peach','🍑'), w('kiwi','🥝'), w('melon','🍈') ] },
    { name: '动物小窝', icon: '🐾', fall: 44, spawn: 2.9, goal: 8, direction: 'copy', words: [
      w('panda','🐼'), w('tiger','🐯'), w('rabbit','🐰'), w('mouse','🐭'), w('monkey','🐵'), w('duck','🦆'), w('frog','🐸'), w('bear','🐻') ] },
    { name: '甜点时刻', icon: '🍰', fall: 48, spawn: 2.7, goal: 8, direction: 'copy', words: [
      w('cake','🍰'), w('bread','🍞'), w('candy','🍬'), w('donut','🍩'), w('pizza','🍕'), w('cookie','🍪'), w('honey','🍯'), w('fries','🍟') ] },
    { name: '我的小家', icon: '🏠', fall: 52, spawn: 2.7, goal: 8, direction: 'copy', words: [
      w('house','🏠'), w('door','🚪'), w('sofa','🛋️'), w('phone','📱'), w('clock','🕐'), w('light','💡'), w('bed','🛏️'), w('radio','📻') ] },
    { name: '快车出发', icon: '🚗', fall: 56, spawn: 2.5, goal: 8, direction: 'copy', words: [
      w('car','🚗'), w('bike','🚲'), w('ship','🚢'), w('train','🚂'), w('boat','⛵'), w('plane','✈️'), w('truck','🚚'), w('jeep','🚙') ] },
    { name: '穿衣打扮', icon: '👕', fall: 60, spawn: 2.5, goal: 8, direction: 'copy', words: [
      w('cap','🧢'), w('coat','🧥'), w('shoe','👟'), w('sock','🧦'), w('glove','🧤'), w('scarf','🧣'), w('dress','👗'), w('pants','👖') ] },
    { name: '自然风光', icon: '🌈', fall: 64, spawn: 2.3, goal: 8, direction: 'copy', words: [
      w('flower','🌸'), w('cloud','☁️'), w('water','💧'), w('rain','🌧️'), w('snow','❄️'), w('wind','💨'), w('grass','🌿'), w('mountain','⛰️') ] },
    { name: '太空漫游', icon: '🚀', fall: 68, spawn: 2.3, goal: 8, direction: 'copy', words: [
      w('rocket','🚀'), w('planet','🪐'), w('robot','🤖'), w('alien','👽'), w('comet','☄️'), w('space','🌌'), w('earth','🌍'), w('moon','🌙') ] },
    { name: '巨型怪物', icon: '🦖', fall: 64, spawn: 2.7, goal: 8, direction: 'copy', words: [
      w('elephant','🐘'), w('dinosaur','🦕'), w('umbrella','☂️'), w('butterfly','🦋'), w('pineapple','🍍'), w('strawberry','🍓'), w('crocodile','🐊'), w('watermelon','🍉') ] }
  ];
  /* 终极混战 = 前 11 关全部单词去重大乱斗（与拆分前一致） */
  const mixPool = [...new Map(kidLevels.flatMap(l => l.words).map(x => [x.w, x])).values()];
  kidLevels.push({ name: '终极混战', icon: '👑', fall: 82, spawn: 1.9, goal: 12, direction: 'copy', words: mixPool });

  const kidCore = {
    id: 'kid-core', name: '童话闯关', icon: '🌱', tone: 'kid',
    desc: '短词热身到终极混战，看词抄写的经典闯关',
    levels: kidLevels
  };

  /* ---- 成人词包：日常高频核心（100 词 = 10 关 × 10 词，词义回忆） ---- */
  const dailyCore = {
    id: 'daily-core', name: '日常高频核心', icon: '🎯', tone: 'adult',
    desc: '碎片时间背单词：看中文释义，凭回忆拼出英文',
    levels: [
      { name: '动作', icon: '🏃', fall: 38, spawn: 2.6, goal: 10, direction: 'recall', words: [
        w('delay', null, '/dɪˈleɪ/', 'v. 延迟；推迟'),
        w('forget', null, '/fəˈɡet/', 'v. 忘记'),
        w('accept', null, '/əkˈsept/', 'v. 接受'),
        w('borrow', null, '/ˈbɒrəʊ/', 'v. 借入；借来'),
        w('choose', null, '/tʃuːz/', 'v. 选择'),
        w('explain', null, '/ɪkˈspleɪn/', 'v. 解释；说明'),
        w('hurry', null, '/ˈhʌri/', 'v. 匆忙；赶快'),
        w('invite', null, '/ɪnˈvaɪt/', 'v. 邀请'),
        w('reply', null, '/rɪˈplaɪ/', 'v. 回复；答复'),
        w('suggest', null, '/səˈdʒest/', 'v. 建议；暗示') ] },
      { name: '描述', icon: '🎨', fall: 40, spawn: 2.5, goal: 10, direction: 'recall', words: [
        w('narrow', null, '/ˈnærəʊ/', 'adj. 狭窄的'),
        w('sharp', null, '/ʃɑːp/', 'adj. 锋利的；急剧的'),
        w('quiet', null, '/ˈkwaɪət/', 'adj. 安静的'),
        w('brave', null, '/breɪv/', 'adj. 勇敢的'),
        w('calm', null, '/kɑːm/', 'adj. 平静的；镇静的'),
        w('eager', null, '/ˈiːɡə/', 'adj. 渴望的；热切的'),
        w('gentle', null, '/ˈdʒentl/', 'adj. 温和的；轻柔的'),
        w('proud', null, '/praʊd/', 'adj. 自豪的；骄傲的'),
        w('tidy', null, '/ˈtaɪdi/', 'adj. 整洁的'),
        w('wise', null, '/waɪz/', 'adj. 明智的') ] },
      { name: '时间与日程', icon: '⏰', fall: 44, spawn: 2.4, goal: 10, direction: 'recall', words: [
        w('noon', null, '/nuːn/', 'n. 中午；正午'),
        w('week', null, '/wiːk/', 'n. 星期；周'),
        w('hour', null, '/ˈaʊə/', 'n. 小时'),
        w('minute', null, '/ˈmɪnɪt/', 'n. 分钟；一会儿'),
        w('yesterday', null, '/ˈjestədeɪ/', 'adv. 昨天'),
        w('tonight', null, '/təˈnaɪt/', 'adv. 今晚'),
        w('schedule', null, '/ˈʃedjuːl/', 'n. 日程；计划表'),
        w('deadline', null, '/ˈdedlaɪn/', 'n. 截止时间；最后期限'),
        w('alarm', null, '/əˈlɑːm/', 'n. 闹钟；警报'),
        w('calendar', null, '/ˈkælɪndə/', 'n. 日历；日程表') ] },
      { name: '职场与工作', icon: '💼', fall: 46, spawn: 2.3, goal: 10, direction: 'recall', words: [
        w('meeting', null, '/ˈmiːtɪŋ/', 'n. 会议'),
        w('salary', null, '/ˈsæləri/', 'n. 薪水'),
        w('leader', null, '/ˈliːdə/', 'n. 领导者；领袖'),
        w('colleague', null, '/ˈkɒliːɡ/', 'n. 同事'),
        w('office', null, '/ˈɒfɪs/', 'n. 办公室'),
        w('task', null, '/tɑːsk/', 'n. 任务；工作'),
        w('report', null, '/rɪˈpɔːt/', 'n./v. 报告；汇报'),
        w('interview', null, '/ˈɪntəvjuː/', 'n. 面试；采访'),
        w('project', null, '/ˈprɒdʒekt/', 'n. 项目；工程'),
        w('boss', null, '/bɒs/', 'n. 老板；上司') ] },
      { name: '情绪与性格', icon: '💛', fall: 48, spawn: 2.2, goal: 10, direction: 'recall', words: [
        w('angry', null, '/ˈæŋɡri/', 'adj. 生气的'),
        w('nervous', null, '/ˈnɜːvəs/', 'adj. 紧张的'),
        w('lonely', null, '/ˈləʊnli/', 'adj. 孤独的'),
        w('excited', null, '/ɪkˈsaɪtɪd/', 'adj. 兴奋的'),
        w('relaxed', null, '/rɪˈlækst/', 'adj. 放松的'),
        w('confident', null, '/ˈkɒnfɪdənt/', 'adj. 自信的'),
        w('jealous', null, '/ˈdʒeləs/', 'adj. 嫉妒的'),
        w('grateful', null, '/ˈɡreɪtfl/', 'adj. 感激的'),
        w('bored', null, '/bɔːd/', 'adj. 无聊的；厌倦的'),
        w('upset', null, '/ʌpˈset/', 'adj. 心烦的；难过') ] },
      { name: '饮食与点餐', icon: '🍜', fall: 50, spawn: 2.2, goal: 10, direction: 'recall', words: [
        w('hungry', null, '/ˈhʌŋɡri/', 'adj. 饥饿的'),
        w('thirsty', null, '/ˈθɜːsti/', 'adj. 口渴的'),
        w('menu', null, '/ˈmenjuː/', 'n. 菜单'),
        w('order', null, '/ˈɔːdə/', 'v. 点餐；订购'),
        w('bill', null, '/bɪl/', 'n. 账单'),
        w('snack', null, '/snæk/', 'n. 零食；小吃'),
        w('dessert', null, '/dɪˈzɜːt/', 'n. 甜点；餐后甜食'),
        w('vegetable', null, '/ˈvedʒtəbl/', 'n. 蔬菜'),
        w('rice', null, '/raɪs/', 'n. 米饭；大米'),
        w('coffee', null, '/ˈkɒfi/', 'n. 咖啡') ] },
      { name: '城市与出行', icon: '🚇', fall: 54, spawn: 2.1, goal: 10, direction: 'recall', words: [
        w('traffic', null, '/ˈtræfɪk/', 'n. 交通；车流'),
        w('station', null, '/ˈsteɪʃn/', 'n. 车站'),
        w('airport', null, '/ˈeəpɔːt/', 'n. 机场'),
        w('underground', null, '/ˌʌndəˈɡraʊnd/', 'n. 地铁（英式）'),
        w('corner', null, '/ˈkɔːnə/', 'n. 拐角；角落'),
        w('highway', null, '/ˈhaɪweɪ/', 'n. 公路；高速路'),
        w('parking', null, '/ˈpɑːkɪŋ/', 'n. 停车；停车场'),
        w('map', null, '/mæp/', 'n. 地图'),
        w('luggage', null, '/ˈlʌɡɪdʒ/', 'n. 行李'),
        w('destination', null, '/ˌdestɪˈneɪʃn/', 'n. 目的地') ] },
      { name: '数字与金钱', icon: '💰', fall: 58, spawn: 2.0, goal: 10, direction: 'recall', words: [
        w('money', null, '/ˈmʌni/', 'n. 金钱'),
        w('change', null, '/tʃeɪndʒ/', 'n. 零钱；改变'),
        w('afford', null, '/əˈfɔːd/', 'v. 买得起；负担得起'),
        w('budget', null, '/ˈbʌdʒɪt/', 'n. 预算'),
        w('expensive', null, '/ɪkˈspensɪv/', 'adj. 昂贵的'),
        w('savings', null, '/ˈseɪvɪŋz/', 'n. 存款；储蓄'),
        w('discount', null, '/ˈdɪskaʊnt/', 'n. 折扣'),
        w('rent', null, '/rent/', 'n. 租金'),
        w('free', null, '/friː/', 'adj. 免费的；空闲的'),
        w('half', null, '/hɑːf/', 'n. 一半') ] },
      { name: '健康与身体', icon: '💊', fall: 60, spawn: 2.0, goal: 10, direction: 'recall', words: [
        w('healthy', null, '/ˈhelθi/', 'adj. 健康的'),
        w('exercise', null, '/ˈeksəsaɪz/', 'n./v. 锻炼；运动'),
        w('medicine', null, '/ˈmedsn/', 'n. 药；医学'),
        w('sleepy', null, '/ˈsliːpi/', 'adj. 困的；想睡的'),
        w('diet', null, '/ˈdaɪət/', 'n. 饮食；节食'),
        w('injury', null, '/ˈɪndʒəri/', 'n. 受伤；伤口'),
        w('cough', null, '/kɒf/', 'n./v. 咳嗽'),
        w('fever', null, '/ˈfiːvə/', 'n. 发烧'),
        w('rest', null, '/rest/', 'n./v. 休息'),
        w('pain', null, '/peɪn/', 'n. 疼痛') ] },
      { name: '社交与沟通', icon: '💬', fall: 66, spawn: 1.8, goal: 10, direction: 'recall', words: [
        w('message', null, '/ˈmesɪdʒ/', 'n. 消息；短信'),
        w('phone', null, '/fəʊn/', 'n. 电话'),
        w('gossip', null, '/ˈɡɒsɪp/', 'n. 八卦；闲话'),
        w('apologize', null, '/əˈpɒlədʒaɪz/', 'v. 道歉'),
        w('complain', null, '/kəmˈpleɪn/', 'v. 抱怨；投诉'),
        w('quarrel', null, '/ˈkwɒrəl/', 'v. 争吵'),
        w('trust', null, '/trʌst/', 'v. 信任；相信'),
        w('joke', null, '/dʒəʊk/', 'n. 玩笑；笑话'),
        w('stranger', null, '/ˈstreɪndʒə/', 'n. 陌生人'),
        w('forgive', null, '/fəˈɡɪv/', 'v. 原谅；宽恕') ] }
    ]
  };

  /* ---- 成人词包二：职场高频核心（100 词 = 10 关 × 10 词，词义回忆） ---- */
  const workplaceCore = {
    id: 'workplace-core', name: '职场高频核心', icon: '💼', tone: 'adult',
    desc: '开会、邮件、面试到项目进度：工作里真正会用到的词',
    levels: [
      { name: '会议与沟通', icon: '🗣️', fall: 42, spawn: 2.7, goal: 10, direction: 'recall', words: [
        w('agenda', null, '/əˈdʒendə/', 'n. 议程'),
        w('hold', null, '/həʊld/', 'v. 召开；举行'),
        w('brief', null, '/briːf/', 'adj. 简短的'),
        w('chair', null, '/tʃeə/', 'v. 主持（会议）'),
        w('discuss', null, '/dɪˈskʌs/', 'v. 讨论'),
        w('note', null, '/nəʊt/', 'n. 记录；笔记'),
        w('finalize', null, '/ˈfaɪnəlaɪz/', 'v. 定稿；敲定'),
        w('summarize', null, '/ˈsʌməraɪz/', 'v. 总结；概括'),
        w('present', null, '/prɪˈzent/', 'v. 汇报；展示'),
        w('vote', null, '/vəʊt/', 'v./n. 表决') ] },
      { name: '邮件与文档', icon: '📧', fall: 44, spawn: 2.6, goal: 10, direction: 'recall', words: [
        w('draft', null, '/drɑːft/', 'n. 草稿'),
        w('enclose', null, '/ɪnˈkləʊz/', 'v. 附寄；随函附上'),
        w('heading', null, '/ˈhedɪŋ/', 'n. 标题'),
        w('recipient', null, '/rɪˈsɪpiənt/', 'n. 收件人'),
        w('signature', null, '/ˈsɪɡnətʃə/', 'n. 签名；落款'),
        w('archive', null, '/ˈɑːkaɪv/', 'v. 归档'),
        w('forward', null, '/ˈfɔːwəd/', 'v. 转发'),
        w('outline', null, '/ˈaʊtlaɪn/', 'n. 大纲；提纲'),
        w('template', null, '/ˈtempleɪt/', 'n. 模板'),
        w('copy', null, '/ˈkɒpi/', 'n. 副本；复印件') ] },
      { name: '求职与面试', icon: '🤝', fall: 46, spawn: 2.5, goal: 10, direction: 'recall', words: [
        w('resume', null, '/ˈrezjuːmeɪ/', 'n. 简历'),
        w('candidate', null, '/ˈkændɪdət/', 'n. 求职者；候选人'),
        w('hire', null, '/ˈhaɪə/', 'v. 聘用'),
        w('vacancy', null, '/ˈveɪkənsi/', 'n. 职位空缺'),
        w('apply', null, '/əˈplaɪ/', 'v. 申请'),
        w('offer', null, '/ˈɒfə/', 'n. 录用通知'),
        w('experience', null, '/ɪkˈspɪəriəns/', 'n. 经验'),
        w('quit', null, '/kwɪt/', 'v. 辞职'),
        w('promote', null, '/prəˈməʊt/', 'v. 晋升；提拔'),
        w('intern', null, '/ˈɪntɜːn/', 'n. 实习生') ] },
      { name: '团队与管理', icon: '👥', fall: 48, spawn: 2.4, goal: 10, direction: 'recall', words: [
        w('assign', null, '/əˈsaɪn/', 'v. 分派；指派'),
        w('delegate', null, '/ˈdelɪɡeɪt/', 'v. 委派；授权'),
        w('coordinate', null, '/kəʊˈɔːdɪneɪt/', 'v. 协调'),
        w('mentor', null, '/ˈmentɔː/', 'n. 导师'),
        w('evaluate', null, '/ɪˈvæljueɪt/', 'v. 评估；考核'),
        w('feedback', null, '/ˈfiːdbæk/', 'n. 反馈'),
        w('instruct', null, '/ɪnˈstrʌkt/', 'v. 指导；指示'),
        w('supervise', null, '/ˈsuːpəvaɪz/', 'v. 监督；主管'),
        w('recruit', null, '/rɪˈkruːt/', 'v. 招聘'),
        w('train', null, '/treɪn/', 'v. 培训') ] },
      { name: '项目与进度', icon: '📈', fall: 50, spawn: 2.3, goal: 10, direction: 'recall', words: [
        w('milestone', null, '/ˈmaɪlstəʊn/', 'n. 里程碑'),
        w('launch', null, '/lɔːntʃ/', 'v. 启动；上线'),
        w('overdue', null, '/ˌəʊvəˈdjuː/', 'adj. 逾期的'),
        w('progress', null, '/ˈprəʊɡres/', 'n. 进展'),
        w('deliver', null, '/dɪˈlɪvə/', 'v. 交付'),
        w('assess', null, '/əˈses/', 'v. 评估；评定'),
        w('risk', null, '/rɪsk/', 'n. 风险'),
        w('scope', null, '/skəʊp/', 'n. 范围'),
        w('vendor', null, '/ˈvendə/', 'n. 供应商'),
        w('upgrade', null, '/ˈʌpɡreɪd/', 'v. 升级') ] },
      { name: '薪资与福利', icon: '🧾', fall: 52, spawn: 2.2, goal: 10, direction: 'recall', words: [
        w('bonus', null, '/ˈbəʊnəs/', 'n. 奖金'),
        w('raise', null, '/reɪz/', 'n. 加薪'),
        w('wage', null, '/weɪdʒ/', 'n. 工资（按周/日）'),
        w('pension', null, '/ˈpenʃn/', 'n. 养老金'),
        w('insurance', null, '/ɪnˈʃʊərəns/', 'n. 保险'),
        w('subsidy', null, '/ˈsʌbsədi/', 'n. 补助；补贴'),
        w('deduct', null, '/dɪˈdʌkt/', 'v. 扣除'),
        w('overtime', null, '/ˈəʊvətaɪm/', 'n. 加班'),
        w('allowance', null, '/əˈlaʊəns/', 'n. 津贴；补贴'),
        w('tax', null, '/tæks/', 'n. 税') ] },
      { name: '数据与报表', icon: '📊', fall: 56, spawn: 2.1, goal: 10, direction: 'recall', words: [
        w('metric', null, '/ˈmetrɪk/', 'n. 指标'),
        w('chart', null, '/tʃɑːt/', 'n. 图表'),
        w('analyze', null, '/ˈænəlaɪz/', 'v. 分析'),
        w('statistic', null, '/stəˈtɪstɪk/', 'n. 统计数据'),
        w('review', null, '/rɪˈvjuː/', 'v. 复盘；审阅'),
        w('forecast', null, '/ˈfɔːkɑːst/', 'n. 预测'),
        w('trend', null, '/trend/', 'n. 趋势'),
        w('insight', null, '/ˈɪnsaɪt/', 'n. 洞察；见解'),
        w('gather', null, '/ˈɡæðə/', 'v. 汇总；收集'),
        w('quantity', null, '/ˈkwɒntəti/', 'n. 数量') ] },
      { name: '商务出差', icon: '✈️', fall: 60, spawn: 2.0, goal: 10, direction: 'recall', words: [
        w('itinerary', null, '/aɪˈtɪnərəri/', 'n. 行程单'),
        w('visa', null, '/ˈviːzə/', 'n. 签证'),
        w('passport', null, '/ˈpɑːspɔːt/', 'n. 护照'),
        w('depart', null, '/dɪˈpɑːt/', 'v. 出发'),
        w('arrange', null, '/əˈreɪndʒ/', 'v. 安排'),
        w('customs', null, '/ˈkʌstəmz/', 'n. 海关'),
        w('book', null, '/bʊk/', 'v. 预订'),
        w('expense', null, '/ɪkˈspens/', 'n. 费用；开支'),
        w('transfer', null, '/ˈtrænsfɜː/', 'n. 中转；换乘'),
        w('hotel', null, '/həʊˈtel/', 'n. 酒店') ] },
      { name: '客户与销售', icon: '☎️', fall: 64, spawn: 1.9, goal: 10, direction: 'recall', words: [
        w('client', null, '/ˈklaɪənt/', 'n. 客户'),
        w('negotiate', null, '/nɪˈɡəʊʃieɪt/', 'v. 谈判；洽谈'),
        w('market', null, '/ˈmɑːkɪt/', 'v. 推广；营销'),
        w('quote', null, '/kwəʊt/', 'n. 报价'),
        w('deal', null, '/diːl/', 'n. 交易；订单'),
        w('agreement', null, '/əˈɡriːmənt/', 'n. 协议；合同'),
        w('lead', null, '/liːd/', 'n. 销售线索'),
        w('prospect', null, '/ˈprɒspekt/', 'n. 潜在客户'),
        w('retain', null, '/rɪˈteɪn/', 'v. 留存；保住'),
        w('satisfy', null, '/ˈsætɪsfaɪ/', 'v. 使满意') ] },
      { name: '职业发展', icon: '🚀', fall: 70, spawn: 1.8, goal: 10, direction: 'recall', words: [
        w('promotion', null, '/prəˈməʊʃn/', 'n. 晋升'),
        w('skill', null, '/skɪl/', 'n. 技能'),
        w('networking', null, '/ˈnetwɜːkɪŋ/', 'n. 人脉拓展'),
        w('appraisal', null, '/əˈpraɪzl/', 'n. 绩效评估'),
        w('goal', null, '/ɡəʊl/', 'n. 目标'),
        w('expertise', null, '/ˌekspɜːˈtiːz/', 'n. 专长；专业能力'),
        w('morale', null, '/məˈrɑːl/', 'n. 士气'),
        w('transition', null, '/trænˈzɪʃn/', 'n. 转型；过渡'),
        w('balance', null, '/ˈbæləns/', 'n. 平衡'),
        w('fulfill', null, '/fʊlˈfɪl/', 'v. 实现；履行') ] }
    ]
  };

  /* ---- 成人词包三：四六级·日常高频（100 词 = 10 关 × 10 词，词义回忆） ----
     选词原则（REQ-TC001 数据层扩展，2026-09-24）：以四六级词表为底，
     优先挑日常场景高频词，释义取日常义而非学术义 */
  const cetDaily = {
    id: 'cet-daily', name: '四六级·日常高频', icon: '🎓', tone: 'adult',
    desc: '四六级词表里日常真正用得上的词：社交、居家、购物、天气、网络',
    levels: [
      { name: '社交往来', icon: '🍻', fall: 42, spawn: 2.7, goal: 10, direction: 'recall', words: [
        w('greet', null, '/ɡriːt/', 'v. 问候；打招呼'),
        w('accompany', null, '/əˈkʌmpəni/', 'v. 陪伴；陪同'),
        w('celebrate', null, '/ˈselɪbreɪt/', 'v. 庆祝'),
        w('farewell', null, '/ˌfeəˈwel/', 'n. 告别；欢送会'),
        w('banquet', null, '/ˈbæŋkwɪt/', 'n. 宴会'),
        w('reunion', null, '/riːˈjuːniən/', 'n. 团聚；重聚'),
        w('hospitality', null, '/ˌhɒspɪˈtæləti/', 'n. 好客；款待'),
        w('toast', null, '/təʊst/', 'n. 敬酒；吐司'),
        w('laughter', null, '/ˈlɑːftə/', 'n. 笑；笑声'),
        w('embrace', null, '/ɪmˈbreɪs/', 'v. 拥抱') ] },
      { name: '家常生活', icon: '🧺', fall: 44, spawn: 2.6, goal: 10, direction: 'recall', words: [
        w('laundry', null, '/ˈlɔːndri/', 'n. 洗衣；待洗衣物'),
        w('grocery', null, '/ˈɡrəʊsəri/', 'n. 食品杂货'),
        w('housework', null, '/ˈhaʊswɜːk/', 'n. 家务劳动'),
        w('appliance', null, '/əˈplaɪəns/', 'n. 家用电器'),
        w('furniture', null, '/ˈfɜːnɪtʃə/', 'n. 家具'),
        w('vacuum', null, '/ˈvækjuːm/', 'v. 用吸尘器清扫'),
        w('mop', null, '/mɒp/', 'v. 拖地'),
        w('curtain', null, '/ˈkɜːtn/', 'n. 窗帘'),
        w('kettle', null, '/ˈketl/', 'n. 水壶'),
        w('balcony', null, '/ˈbælkəni/', 'n. 阳台') ] },
      { name: '购物消费', icon: '🛍️', fall: 46, spawn: 2.5, goal: 10, direction: 'recall', words: [
        w('receipt', null, '/rɪˈsiːt/', 'n. 收据；小票'),
        w('sample', null, '/ˈsɑːmpl/', 'n. 试用品；样品'),
        w('coupon', null, '/ˈkuːpɒn/', 'n. 优惠券'),
        w('exchange', null, '/ɪksˈtʃeɪndʒ/', 'v. 退换；交换'),
        w('installment', null, '/ɪnˈstɔːlmənt/', 'n. 分期付款'),
        w('brand', null, '/brænd/', 'n. 品牌'),
        w('luxury', null, '/ˈlʌkʃəri/', 'n. 奢侈品'),
        w('outlet', null, '/ˈaʊtlet/', 'n. 折扣店'),
        w('delivery', null, '/dɪˈlɪvəri/', 'n. 配送；快递'),
        w('warranty', null, '/ˈwɒrənti/', 'n. 保修单') ] },
      { name: '出行问路', icon: '🚸', fall: 48, spawn: 2.4, goal: 10, direction: 'recall', words: [
        w('pedestrian', null, '/pəˈdestriən/', 'n. 行人'),
        w('sidewalk', null, '/ˈsaɪdwɔːk/', 'n. 人行道'),
        w('fare', null, '/feə/', 'n. 车费'),
        w('tram', null, '/træm/', 'n. 有轨电车'),
        w('commute', null, '/kəˈmjuːt/', 'v. 通勤'),
        w('lane', null, '/leɪn/', 'n. 车道；小巷'),
        w('journey', null, '/ˈdʒɜːni/', 'n. 旅程'),
        w('voyage', null, '/ˈvɔɪɪdʒ/', 'n. 航行'),
        w('bypass', null, '/ˈbaɪpɑːs/', 'n. 绕行道'),
        w('intersection', null, '/ˌɪntəˈsekʃn/', 'n. 十字路口') ] },
      { name: '饮食烹调', icon: '🍳', fall: 50, spawn: 2.3, goal: 10, direction: 'recall', words: [
        w('recipe', null, '/ˈresəpi/', 'n. 食谱'),
        w('boil', null, '/bɔɪl/', 'v. 煮沸'),
        w('steam', null, '/stiːm/', 'v. 蒸'),
        w('fry', null, '/fraɪ/', 'v. 油炸；煎'),
        w('grill', null, '/ɡrɪl/', 'v. 烧烤'),
        w('ingredient', null, '/ɪnˈɡriːdiənt/', 'n. 食材；原料'),
        w('appetite', null, '/ˈæpɪtaɪt/', 'n. 食欲'),
        w('leftover', null, '/ˈleftəʊvə/', 'n. 剩饭剩菜'),
        w('nutrition', null, '/njuːˈtrɪʃn/', 'n. 营养'),
        w('chew', null, '/tʃuː/', 'v. 咀嚼') ] },
      { name: '天气季节', icon: '🌦️', fall: 54, spawn: 2.2, goal: 10, direction: 'recall', words: [
        w('humid', null, '/ˈhjuːmɪd/', 'adj. 潮湿的'),
        w('chilly', null, '/ˈtʃɪli/', 'adj. 寒冷的'),
        w('scorching', null, '/ˈskɔːtʃɪŋ/', 'adj. 炎热的'),
        w('typhoon', null, '/taɪˈfuːn/', 'n. 台风'),
        w('breeze', null, '/briːz/', 'n. 微风'),
        w('lightning', null, '/ˈlaɪtnɪŋ/', 'n. 闪电'),
        w('frost', null, '/frɒst/', 'n. 霜冻'),
        w('mist', null, '/mɪst/', 'n. 薄雾'),
        w('rainbow', null, '/ˈreɪnbəʊ/', 'n. 彩虹'),
        w('drizzle', null, '/ˈdrɪzl/', 'n. 毛毛雨') ] },
      { name: '身体状态', icon: '🤒', fall: 58, spawn: 2.1, goal: 10, direction: 'recall', words: [
        w('jog', null, '/dʒɒɡ/', 'v. 慢跑'),
        w('yawn', null, '/jɔːn/', 'v. 打哈欠'),
        w('sneeze', null, '/sniːz/', 'v. 打喷嚏'),
        w('exhausted', null, '/ɪɡˈzɔːstɪd/', 'adj. 筋疲力尽的'),
        w('insomnia', null, '/ɪnˈsɒmniə/', 'n. 失眠'),
        w('recovery', null, '/rɪˈkʌvəri/', 'n. 恢复；痊愈'),
        w('prescription', null, '/prɪˈskrɪpʃn/', 'n. 处方'),
        w('dizzy', null, '/ˈdɪzi/', 'adj. 头晕的'),
        w('vaccine', null, '/ˈvæksiːn/', 'n. 疫苗'),
        w('chill', null, '/tʃɪl/', 'n. 着凉；v. 放松') ] },
      { name: '情绪表达', icon: '🎭', fall: 62, spawn: 2.0, goal: 10, direction: 'recall', words: [
        w('delighted', null, '/dɪˈlaɪtɪd/', 'adj. 高兴的'),
        w('anxious', null, '/ˈæŋkʃəs/', 'adj. 焦虑的'),
        w('embarrassed', null, '/ɪmˈbærəst/', 'adj. 尴尬的'),
        w('irritated', null, '/ˈɪrɪteɪtɪd/', 'adj. 烦躁的'),
        w('gloomy', null, '/ˈɡluːmi/', 'adj. 沮丧的'),
        w('joyful', null, '/ˈdʒɔɪfl/', 'adj. 欢快的'),
        w('sentimental', null, '/ˌsentɪˈmentl/', 'adj. 多愁善感的'),
        w('overwhelmed', null, '/ˌəʊvəˈwelmd/', 'adj. 不堪重负的'),
        w('content', null, '/kənˈtent/', 'adj. 满足的'),
        w('relieved', null, '/rɪˈliːvd/', 'adj. 如释重负的') ] },
      { name: '网络手机', icon: '📱', fall: 66, spawn: 1.9, goal: 10, direction: 'recall', words: [
        w('download', null, '/ˈdaʊnləʊd/', 'v. 下载'),
        w('upload', null, '/ˈʌpləʊd/', 'v. 上传'),
        w('account', null, '/əˈkaʊnt/', 'n. 账号'),
        w('password', null, '/ˈpɑːswɜːd/', 'n. 密码'),
        w('recharge', null, '/ˌriːˈtʃɑːdʒ/', 'v. 充值'),
        w('screenshot', null, '/ˈskriːnʃɒt/', 'n. 截图'),
        w('wireless', null, '/ˈwaɪələs/', 'adj. 无线的'),
        w('notification', null, '/ˌnəʊtɪfɪˈkeɪʃn/', 'n. 通知提醒'),
        w('battery', null, '/ˈbætri/', 'n. 电池'),
        w('click', null, '/klɪk/', 'v. 点击') ] },
      { name: '学习成长', icon: '📚', fall: 72, spawn: 1.8, goal: 10, direction: 'recall', words: [
        w('memorize', null, '/ˈmeməraɪz/', 'v. 背诵；记忆'),
        w('recite', null, '/rɪˈsaɪt/', 'v. 朗诵；背诵'),
        w('concentrate', null, '/ˈkɒnsntreɪt/', 'v. 专心；集中'),
        w('distract', null, '/dɪˈstrækt/', 'v. 分心；打扰'),
        w('ambition', null, '/æmˈbɪʃn/', 'n. 抱负；雄心'),
        w('habit', null, '/ˈhæbɪt/', 'n. 习惯'),
        w('improve', null, '/ɪmˈpruːv/', 'v. 提高；改善'),
        w('knowledge', null, '/ˈnɒlɪdʒ/', 'n. 知识'),
        w('patience', null, '/ˈpeɪʃns/', 'n. 耐心'),
        w('explore', null, '/ɪkˈsplɔː/', 'v. 探索') ] }
    ]
  };

  /* 菜单顺序：四六级日常包紧随儿童包（词库主方向），其后是日常高频与职场 */
  window.WordPacks = [kidCore, cetDaily, dailyCore, workplaceCore];
})();
