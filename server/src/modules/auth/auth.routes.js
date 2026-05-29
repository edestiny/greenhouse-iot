// ============================================================
// 认证模块 — 微信登录
// ============================================================
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');
const db = require('../../database');

// ---- Controller ----
const login = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ code: 400, message: '缺少 code 参数' });
    }

    const result = await authService.login(code);
    res.json({ code: 200, data: result });
  } catch (err) {
    next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = db.prepare('SELECT id as uid, openid, nickname, avatar_url FROM users WHERE id = ?').get(req.user.uid);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }
    res.json({ code: 200, data: user });
  } catch (err) {
    next(err);
  }
};

// ---- Service ----
const authService = {
  async login(code) {
    // ── 开发模式：未配置真实 AppSecret 时跳过微信 API ──
    const IS_DEV = !config.wx.appid || config.wx.appid === 'your_appid_here' || !config.wx.secret;
    if (IS_DEV) {
      console.warn('[Auth] 开发模式 — 未配置真实 AppID，使用模拟 openid');
      // 用 code 的简单 hash 模拟唯一 openid
      const openid = 'dev_' + require('crypto').createHash('md5').update(code || 'default').digest('hex').slice(0, 16);

      let user = db.prepare('SELECT id, openid, nickname, avatar_url FROM users WHERE openid = ?').get(openid);
      if (!user) {
        const uid = uuidv4();
        db.prepare('INSERT INTO users (id, openid) VALUES (?, ?)').run(uid, openid);
        user = { id: uid, openid, nickname: null, avatar_url: null };
      }

      const access_token = jwt.sign(
        { uid: user.id, openid: user.openid },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      return {
        access_token,
        user: { uid: user.id, nickname: user.nickname, avatar_url: user.avatar_url },
      };
    }

    // 调用微信接口获取 openid
    const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${config.wx.appid}&secret=${config.wx.secret}&js_code=${code}&grant_type=authorization_code`;

    const response = await fetch(wxUrl);
    const wxData = await response.json();

    if (wxData.errcode) {
      throw Object.assign(new Error('微信登录失败'), {
        statusCode: 400,
        detail: wxData,
      });
    }

    const { openid } = wxData;

    // 查找或创建用户
    let user = db.prepare('SELECT id, openid, nickname, avatar_url FROM users WHERE openid = ?').get(openid);

    if (!user) {
      const uid = uuidv4();
      db.prepare('INSERT INTO users (id, openid) VALUES (?, ?)').run(uid, openid);
      user = { id: uid, openid, nickname: null, avatar_url: null };
    }

    // 签发 JWT
    const access_token = jwt.sign(
      { uid: user.id, openid: user.openid },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    return {
      access_token,
      user: {
        uid: user.id,
        nickname: user.nickname,
        avatar_url: user.avatar_url,
      },
    };
  },
};

// ---- Routes ----
const router = require('express').Router();
const { auth } = require('../../middleware/auth');

router.post('/login', login);
router.get('/me', auth, getMe);

module.exports = router;
