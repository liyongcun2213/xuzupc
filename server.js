const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcrypt');
const moment = require('moment');
const QRCode = require('qrcode');
const https = require('https');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// 配置数据库连接
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    charset: 'utf8mb4',
    insecureAuth: true,
    // 尝试多种连接选项以解决兼容性问题
    connectTimeout: 10000,
});

db.on('error', (err) => {
    console.error('MySQL 连接异常:', err);
});

// 连接数据库
db.connect((err) => {
    if (err) {
        console.error('数据库连接失败: ', err);
        return;
    }
    console.log('已连接到MySQL数据库');

    // 确保资产配置表存在（用于折旧率、二维码基础地址等配置）
    const createAssetSettingsTableSql = `
        CREATE TABLE IF NOT EXISTS asset_settings (
            id INT PRIMARY KEY AUTO_INCREMENT,
            setting_name VARCHAR(100) NOT NULL,
            setting_value VARCHAR(255) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `;

    db.query(createAssetSettingsTableSql, (createErr) => {
        if (createErr) {
            console.error('创建 asset_settings 表失败:', createErr);
            return;
        }

        db.query('SELECT COUNT(*) AS count FROM asset_settings', (countErr, countResults) => {
            if (countErr) {
                console.error('统计 asset_settings 记录失败:', countErr);
                return;
            }

            const rowCount = countResults && countResults[0] ? countResults[0].count : 0;
            if (rowCount === 0) {
                const defaultSettings = [
                    ['equipment_depreciation_rate', '0.05', '设备年折旧率(5%)'],
                    ['accessory_depreciation_rate', '0.10', '配件年折旧率(10%)'],
                    ['monthly_rental_multiplier', '0.0667', '月租金计算倍数(总价/15，约为1/15)'],
                    ['daily_rental_from_monthly', '0.0333', '日租金从月租金计算(月租金/30)'],
                    ['external_base_url', process.env.EXTERNAL_BASE_URL || 'http://192.168.2.74:3000', '设备二维码访问基础地址']
                ];

                db.query(
                    'INSERT INTO asset_settings (setting_name, setting_value, description) VALUES ? ',
                    [defaultSettings],
                    (insertErr) => {
                        if (insertErr) {
                            console.error('插入默认 asset_settings 记录失败:', insertErr);
                        } else {
                            console.log('已初始化 asset_settings 默认配置');
                        }
                    }
                );
            }
        });

        // 确保配件月度资产快照表存在
        const createAccessorySnapshotsTableSql = `
            CREATE TABLE IF NOT EXISTS accessory_asset_snapshots (
                id INT PRIMARY KEY AUTO_INCREMENT,
                snapshot_month DATE NOT NULL COMMENT '月份（取当月第一天）',
                new_accessory_quantity INT NOT NULL DEFAULT 0 COMMENT '新增配件数量',
                new_accessory_total_value DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '新增配件总价值',
                scrapped_accessory_quantity INT NOT NULL DEFAULT 0 COMMENT '报废配件数量',
                scrapped_accessory_total_value DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '报废配件总价值',
                total_accessory_quantity INT NOT NULL DEFAULT 0 COMMENT '配件总数（截至当月）',
                total_accessory_total_value DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '配件总价值（截至当月）',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_snapshot_month (snapshot_month)
            )
        `;

        db.query(createAccessorySnapshotsTableSql, (snapshotErr) => {
            if (snapshotErr) {
                console.error('创建 accessory_asset_snapshots 表失败:', snapshotErr);
            } else {
                console.log('已确保 accessory_asset_snapshots 表存在');
            }
        });

        // 确保财务账户表存在（用于区分公账、私账等账户）
        const createFinanceAccountsTableSql = `
            CREATE TABLE IF NOT EXISTS finance_accounts (
                id INT PRIMARY KEY AUTO_INCREMENT,
                code ENUM('public', 'private') NOT NULL COMMENT '账户代码',
                name VARCHAR(100) NOT NULL COMMENT '账户名称',
                description VARCHAR(255) NULL COMMENT '说明',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_finance_account_code (code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;

        db.query(createFinanceAccountsTableSql, (faErr) => {
            if (faErr) {
                console.error('创建 finance_accounts 表失败:', faErr);
            } else {
                console.log('已确保 finance_accounts 表存在');

                // 初始化公账和私账两个基础账户
                const initAccountsSql = `
                    INSERT INTO finance_accounts (code, name, description)
                    VALUES 
                        ('public', '公司公账', '公司对公银行账户'),
                        ('private', '法人私账', '法人个人账户')
                    ON DUPLICATE KEY UPDATE 
                        name = VALUES(name),
                        description = VALUES(description);
                `;

                db.query(initAccountsSql, (initErr) => {
                    if (initErr) {
                        console.error('初始化 finance_accounts 失败:', initErr);
                    } else {
                        console.log('已确保公账和私账账户存在');
                    }
                });
            }
        });

        // 为 financial_records 增加账户字段（如果尚不存在），用于实现流水账按账户统计
        const checkAccountIdColumnSql = "SHOW COLUMNS FROM financial_records LIKE 'account_id'";
        db.query(checkAccountIdColumnSql, (colErr, columns) => {
            if (colErr) {
                console.error('检查 financial_records.account_id 字段失败:', colErr);
                return;
            }

            if (!columns || columns.length === 0) {
                const addAccountIdColumnSql = `
                    ALTER TABLE financial_records
                    ADD COLUMN account_id INT NULL AFTER category,
                    ADD CONSTRAINT fk_financial_records_account
                        FOREIGN KEY (account_id) REFERENCES finance_accounts(id)
                `;

                db.query(addAccountIdColumnSql, (alterErr) => {
                    if (alterErr) {
                        console.error('为 financial_records 添加 account_id 字段失败:', alterErr);
                    } else {
                        console.log('已为 financial_records 添加 account_id 字段');
                    }
                });
            }
        });

        // 为 users 表增加微信绑定字段（如果尚不存在）
        const checkWechatOpenIdColumnSql = "SHOW COLUMNS FROM users LIKE 'wechat_openid'";
        db.query(checkWechatOpenIdColumnSql, (userColErr, userColumns) => {
            if (userColErr) {
                console.error('检查 users.wechat_openid 字段失败:', userColErr);
            } else if (!userColumns || userColumns.length === 0) {
                const addWechatColumnsSql = `
                    ALTER TABLE users
                    ADD COLUMN wechat_openid VARCHAR(64) NULL AFTER phone,
                    ADD COLUMN wechat_nickname VARCHAR(100) NULL AFTER wechat_openid
                `;

                db.query(addWechatColumnsSql, (alterErr) => {
                    if (alterErr) {
                        console.error('为 users 表添加微信字段失败:', alterErr);
                    } else {
                        console.log('已为 users 表添加 wechat_openid/wechat_nickname 字段');
                    }
                });
            }
        });

        // 确保 users.role 包含 guest 角色（未授权微信用户默认角色）
        const checkUserRoleColumnSql = "SHOW COLUMNS FROM users LIKE 'role'";
        db.query(checkUserRoleColumnSql, (roleColErr, roleColumns) => {
            if (roleColErr) {
                console.error('检查 users.role 字段失败:', roleColErr);
            } else if (roleColumns && roleColumns.length > 0) {
                const typeDefinition = roleColumns[0].Type || '';
                if (!typeDefinition.includes('guest')) {
                    const modifyRoleSql = `
                        ALTER TABLE users
                        MODIFY COLUMN role ENUM('admin','finance','sales','guest') NOT NULL DEFAULT 'guest'
                    `;

                    db.query(modifyRoleSql, (alterErr) => {
                        if (alterErr) {
                            console.error('扩展 users.role 枚举失败:', alterErr);
                        } else {
                            console.log('已为 users.role 增加 guest 角色');
                        }
                    });
                }
            }
        });

        // 确保 login_sessions 表存在（用于电脑端微信扫码登录）
        const createLoginSessionsTableSql = `
            CREATE TABLE IF NOT EXISTS login_sessions (
                token VARCHAR(64) PRIMARY KEY,
                user_id INT NULL,
                status ENUM('pending','confirmed','expired') NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NULL,
                INDEX idx_status_created_at (status, created_at),
                CONSTRAINT fk_login_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;

        db.query(createLoginSessionsTableSql, (lsErr) => {
            if (lsErr) {
                console.error('创建 login_sessions 表失败:', lsErr);
            } else {
                console.log('已确保 login_sessions 表存在');
            }
        });
    });
});


// 中间件配置
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 配置会话
app.use(session({
    secret: 'rental_system_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // 1小时
}));

// 将会话中的提示消息传递给所有视图
app.use((req, res, next) => {
    res.locals.successMessage = req.session.successMessage;
    res.locals.errorMessage = req.session.errorMessage;

    delete req.session.successMessage;
    delete req.session.errorMessage;

    next();
});

// 检查用户是否登录的中间件
function isAuthenticated(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const currentUser = req.session.user;

    // 未授权的访客（guest）只允许访问仪表板和仪表板相关接口
    if (currentUser.role === 'guest') {
        const allowedPaths = ['/dashboard', '/logout'];
        const requestPath = req.path || '';

        const isAllowed =
            allowedPaths.includes(requestPath) ||
            requestPath.startsWith('/api/finance/');

        if (!isAllowed) {
            req.session.errorMessage = '当前微信账号尚未被授权，请联系管理员在“用户管理”中分配角色';
            return res.redirect('/dashboard');
        }
    }

    return next();
}


// 检查用户权限的中间件
function checkRole(role) {
    return (req, res, next) => {
        if (req.session.user && req.session.user.role === role) {
            return next();
        }
        res.status(403).send('权限不足');
    };
}

// 供后续路由使用的简单角色检查工具
function hasRole(user, roles) {
    if (!user || !Array.isArray(roles)) {
        return false;
    }
    return roles.includes(user.role);
}


// 获取用于生成二维码的外部访问基础地址
function getExternalBaseUrl(callback) {
    const defaultUrl = process.env.EXTERNAL_BASE_URL || 'http://192.168.2.74:3000';

    db.query(
        'SELECT setting_value FROM asset_settings WHERE setting_name = "external_base_url" LIMIT 1',
        (err, results) => {
            if (err) {
                console.error('查询 external_base_url 失败:', err);
                return callback(null, defaultUrl);
            }

            if (!results || results.length === 0 || !results[0].setting_value) {
                return callback(null, defaultUrl);
            }

            callback(null, results[0].setting_value);
        }
    );
}

// 微信 JS-SDK 配置（使用服务号 + 小程序）
// 优先从环境变量读取 AppID 和 AppSecret，如果没有再从本地配置文件 wechat-config.json 读取
let WECHAT_APP_ID = process.env.WECHAT_APP_ID || '';
let WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || '';
// 小程序独立的 AppID / AppSecret（优先使用），没有配置时会退回到上面的 WECHAT_APP_ID/SECRET
let WECHAT_MP_APP_ID = process.env.WECHAT_MP_APP_ID || '';
let WECHAT_MP_APP_SECRET = process.env.WECHAT_MP_APP_SECRET || '';

try {
    // wechat-config.json 需要放在项目根目录，与 server.js 同级
    // 格式：{ "appId": "你的AppID", "appSecret": "你的AppSecret" }
    // 如果环境变量没有配置，则从该文件中读取
    const wechatConfig = require('./wechat-config.json');

    if (!WECHAT_APP_ID && wechatConfig && wechatConfig.appId) {
        WECHAT_APP_ID = wechatConfig.appId;
    }

    if (!WECHAT_APP_SECRET && wechatConfig && wechatConfig.appSecret) {
        WECHAT_APP_SECRET = wechatConfig.appSecret;
    }

    if (!WECHAT_MP_APP_ID && wechatConfig && wechatConfig.mpAppId) {
        WECHAT_MP_APP_ID = wechatConfig.mpAppId;
    }

    if (!WECHAT_MP_APP_SECRET && wechatConfig && wechatConfig.mpAppSecret) {
        WECHAT_MP_APP_SECRET = wechatConfig.mpAppSecret;
    }
} catch (e) {
    // 如果配置文件不存在或解析失败，保持使用环境变量
}


let wechatAccessToken = null;
let wechatAccessTokenExpiresAt = 0;
let wechatJsapiTicket = null;
let wechatJsapiTicketExpiresAt = 0;

function fetchWeChatAccessToken(callback) {
    if (!WECHAT_APP_ID || !WECHAT_APP_SECRET) {
        return callback(new Error('WECHAT_APP_ID 或 WECHAT_APP_SECRET 未配置'));
    }

    const now = Date.now();
    if (wechatAccessToken && now < wechatAccessTokenExpiresAt) {
        return callback(null, wechatAccessToken);
    }

    const tokenPath = `/cgi-bin/token?grant_type=client_credential&appid=${WECHAT_APP_ID}&secret=${WECHAT_APP_SECRET}`;

    const options = {
        hostname: 'api.weixin.qq.com',
        path: tokenPath,
        method: 'GET'
    };

    const req = https.request(options, (resp) => {
        let data = '';
        resp.on('data', (chunk) => {
            data += chunk;
        });
        resp.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.errcode) {
                    console.error('获取 access_token 失败:', json);
                    return callback(new Error(json.errmsg || '获取 access_token 失败'));
                }

                wechatAccessToken = json.access_token;
                // 官方有效期 7200 秒，这里预留 5 分钟缓冲
                wechatAccessTokenExpiresAt = Date.now() + (json.expires_in - 300) * 1000;
                callback(null, wechatAccessToken);
            } catch (e) {
                console.error('解析 access_token 响应失败:', e);
                callback(e);
            }
        });
    });

    req.on('error', (err) => {
        console.error('请求 access_token 出错:', err);
        callback(err);
    });

    req.end();
}

// 网页授权：根据 code 获取 openid 等信息
function fetchWeChatOAuthAccessToken(code, callback) {
    if (!WECHAT_APP_ID || !WECHAT_APP_SECRET) {
        return callback(new Error('WECHAT_APP_ID 或 WECHAT_APP_SECRET 未配置'));
    }
    if (!code) {
        return callback(new Error('缺少 code 参数'));
    }

    const oauthPath = `/sns/oauth2/access_token?appid=${WECHAT_APP_ID}&secret=${WECHAT_APP_SECRET}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;

    const options = {
        hostname: 'api.weixin.qq.com',
        path: oauthPath,
        method: 'GET'
    };

    const req = https.request(options, (resp) => {
        let data = '';
        resp.on('data', (chunk) => {
            data += chunk;
        });
        resp.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.errcode) {
                    console.error('获取网页授权 access_token 失败:', json);
                    return callback(new Error(json.errmsg || '获取网页授权 access_token 失败'));
                }
                callback(null, json);
            } catch (e) {
                console.error('解析网页授权 access_token 响应失败:', e);
                callback(e);
            }
        });
    });

    req.on('error', (err) => {
        console.error('请求网页授权 access_token 出错:', err);
        callback(err);
    });

    req.end();
}

// 微信小程序：根据 code 换取 openid/session_key
function fetchWeChatMpSession(code, callback) {
    const mpAppId = WECHAT_MP_APP_ID || WECHAT_APP_ID;
    const mpAppSecret = WECHAT_MP_APP_SECRET || WECHAT_APP_SECRET;

    if (!mpAppId || !mpAppSecret) {
        return callback(new Error('小程序 AppID 或 AppSecret 未配置'));
    }
    if (!code) {
        return callback(new Error('缺少 code 参数'));
    }

    const mpPath = `/sns/jscode2session?appid=${mpAppId}&secret=${mpAppSecret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

    const options = {
        hostname: 'api.weixin.qq.com',
        path: mpPath,
        method: 'GET'
    };

    const req = https.request(options, (resp) => {
        let data = '';
        resp.on('data', (chunk) => {
            data += chunk;
        });
        resp.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.errcode) {
                    console.error('获取小程序会话信息失败:', json);
                    return callback(new Error(json.errmsg || '获取小程序会话信息失败'));
                }
                callback(null, json);
            } catch (e) {
                console.error('解析小程序会话响应失败:', e);
                callback(e);
            }
        });
    });

    req.on('error', (err) => {
        console.error('请求小程序会话信息出错:', err);
        callback(err);
    });

    req.end();
}

// 生成微信小程序会话 token 并写入 wechat_mp_sessions 表
function createWechatMpSession(openid, customerId, callback) {
    if (!openid) {
        return callback(new Error('缺少 openid'));
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 默认 7 天有效

    const insertSql = `
        INSERT INTO wechat_mp_sessions (token, openid, customer_id, expires_at)
        VALUES (?, ?, ?, ?)
    `;

    db.query(insertSql, [token, openid, customerId || null, expiresAt], (err) => {
        if (err) {
            console.error('创建小程序会话失败:', err);
            return callback(err);
        }
        callback(null, { token, expiresAt });
    });
}

// 小程序接口鉴权中间件：根据 token 还原 openid/customer_id
function authenticateWechatMp(req, res, next) {
    const token = req.headers['x-wechat-token'] || req.query.token || (req.body && req.body.token);

    if (!token) {
        return res.status(401).json({ success: false, message: '缺少小程序会话 token' });
    }

    const sql = `
        SELECT token, openid, customer_id, expires_at
        FROM wechat_mp_sessions
        WHERE token = ? AND expires_at > NOW()
        LIMIT 1
    `;

    db.query(sql, [token], (err, results) => {
        if (err) {
            console.error('查询小程序会话失败:', err);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }

        if (!results || results.length === 0) {
            return res.status(401).json({ success: false, message: '会话已失效，请重新登录' });
        }

        const session = results[0];
        req.wechatMpAuth = {
            token: session.token,
            openid: session.openid,
            customerId: session.customer_id || null,
        };

        next();
    });
}


function fetchWeChatJsapiTicket(callback) {
    const now = Date.now();
    if (wechatJsapiTicket && now < wechatJsapiTicketExpiresAt) {
        return callback(null, wechatJsapiTicket);
    }

    fetchWeChatAccessToken((tokenErr, accessToken) => {
        if (tokenErr) {
            return callback(tokenErr);
        }

        const ticketPath = `/cgi-bin/ticket/getticket?access_token=${accessToken}&type=jsapi`;

        const options = {
            hostname: 'api.weixin.qq.com',
            path: ticketPath,
            method: 'GET'
        };

        const req = https.request(options, (resp) => {
            let data = '';
            resp.on('data', (chunk) => {
                data += chunk;
            });
            resp.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.errcode !== 0) {
                        console.error('获取 jsapi_ticket 失败:', json);
                        return callback(new Error(json.errmsg || '获取 jsapi_ticket 失败'));
                    }

                    wechatJsapiTicket = json.ticket;
                    wechatJsapiTicketExpiresAt = Date.now() + (json.expires_in - 300) * 1000;
                    callback(null, wechatJsapiTicket);
                } catch (e) {
                    console.error('解析 jsapi_ticket 响应失败:', e);
                    callback(e);
                }
            });
        });

        req.on('error', (err) => {
            console.error('请求 jsapi_ticket 出错:', err);
            callback(err);
        });

        req.end();
    });
}

function createWechatJsConfig(url, callback) {
    fetchWeChatJsapiTicket((ticketErr, ticket) => {
        if (ticketErr) {
            return callback(ticketErr);
        }

        const noncestr = Math.random().toString(36).substring(2, 15);
        const timestamp = Math.floor(Date.now() / 1000);

        const rawString = `jsapi_ticket=${ticket}&noncestr=${noncestr}&timestamp=${timestamp}&url=${url}`;

        const signature = crypto
            .createHash('sha1')
            .update(rawString)
            .digest('hex');

        callback(null, {
            appId: WECHAT_APP_ID,
            timestamp: timestamp,
            nonceStr: noncestr,
            signature: signature
        });
    });
}

// 为前端提供微信 JS-SDK 配置
app.get('/wechat/js-config', (req, res) => {
    const url = (req.query.url || '').split('#')[0];

    if (!url) {
        return res.json({ success: false, message: '缺少 url 参数' });
    }

    if (!WECHAT_APP_ID || !WECHAT_APP_SECRET) {
        return res.json({ success: false, message: '服务器未配置 WECHAT_APP_ID/WECHAT_APP_SECRET' });
    }

    createWechatJsConfig(url, (err, config) => {
        if (err) {
            console.error('生成微信 JS 配置失败:', err);
            return res.json({
                success: false,
                message: '获取微信配置失败',
                error: err && err.message ? err.message : String(err)
            });
        }

        res.json({ success: true, data: config });
    });
});

// 路由
// 登录页面（支持账号密码登录 + 微信扫码登录）
app.get('/login', (req, res) => {
    const redirect = req.query.redirect || '';

    if (req.session.user) {
        return res.redirect('/dashboard');
    }

    const loginToken = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    getExternalBaseUrl((urlErr, baseUrl) => {
        const safeBaseUrl = (baseUrl || '').replace(/\/$/, '') || `http://localhost:${port}`;
        const scanUrl = `${safeBaseUrl}/wechat/scan-login?token=${loginToken}`;

        QRCode.toDataURL(scanUrl, { width: 260, margin: 1 }, (qrErr, qrCodeDataUrl) => {
            if (qrErr) {
                console.error('生成登录二维码失败:', qrErr);
                qrCodeDataUrl = null;
            }

            const insertSql = `
                INSERT INTO login_sessions (token, status, expires_at)
                VALUES (?, 'pending', ?)
            `;

            db.query(insertSql, [loginToken, expiresAt], (insertErr) => {
                if (insertErr) {
                    console.error('创建登录会话失败:', insertErr);
                }

                res.render('login', {
                    error: null,
                    redirect: redirect,
                    loginToken,
                    qrCodeDataUrl
                });
            });
        });
    });
});


// 处理账号密码登录
app.post('/login', (req, res) => {
    const { username, password, redirect } = req.body;
    const redirectUrl = redirect && typeof redirect === 'string' && redirect.trim() !== ''
        ? redirect
        : '/dashboard';
    
    db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
        if (err) {
            console.error(err);
            return res.render('login', { error: '登录失败，请重试', redirect: redirect });
        }
        
        if (results.length === 0) {
            return res.render('login', { error: '用户名或密码错误', redirect: redirect });
        }
        
        const user = results[0];
        
        // 简化密码验证：仍然保持 admin123 作为演示密码
        if (password === 'admin123') {
            req.session.user = user;
            return res.redirect(redirectUrl);
        }

        return res.render('login', { error: '用户名或密码错误', redirect: redirect });
    });
});

// 轮询登录状态（供电脑端登录页使用）
app.get('/api/login-status', (req, res) => {
    const token = req.query.token;

    if (!token) {
        return res.status(400).json({ success: false, message: '缺少 token 参数' });
    }

    const selectSql = 'SELECT * FROM login_sessions WHERE token = ? LIMIT 1';
    db.query(selectSql, [token], (err, results) => {
        if (err) {
            console.error('查询登录会话失败:', err);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }

        if (!results || results.length === 0) {
            return res.json({ success: true, status: 'not_found' });
        }

        const sessionRow = results[0];
        const now = new Date();

        if (sessionRow.status !== 'confirmed') {
            if (sessionRow.expires_at && now > sessionRow.expires_at) {
                if (sessionRow.status !== 'expired') {
                    db.query('UPDATE login_sessions SET status = ? WHERE token = ?', ['expired', token], () => {});
                }
                return res.json({ success: true, status: 'expired' });
            }
        }

        if (sessionRow.status === 'confirmed' && sessionRow.user_id) {
            db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [sessionRow.user_id], (userErr, userRows) => {
                if (userErr) {
                    console.error('根据登录会话获取用户失败:', userErr);
                    return res.status(500).json({ success: false, message: '服务器错误' });
                }

                if (!userRows || userRows.length === 0) {
                    return res.json({ success: true, status: 'invalid' });
                }

                req.session.user = userRows[0];
                return res.json({ success: true, status: 'ok' });
            });
        } else {
            return res.json({ success: true, status: sessionRow.status || 'pending' });
        }
    });
});

// 登出
app.get('/logout', (req, res) => {

    req.session.destroy();
    res.redirect('/login');
});

// 根路径重定向到仪表板
app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/login');
    }
});

// 微信小程序登录：根据 code 换取 openid，并发放后端会话 token
app.post('/api/wechat/mp/login', (req, res) => {
    const code = (req.body && req.body.code) || null;

    if (!code) {
        return res.status(400).json({ success: false, message: '缺少 code 参数' });
    }

    fetchWeChatMpSession(code, (sessionErr, sessionData) => {
        if (sessionErr) {
            console.error('小程序登录换取会话失败:', sessionErr);
            return res.status(500).json({ success: false, message: '微信会话获取失败' });
        }

        const openid = sessionData && sessionData.openid;
        const unionid = sessionData && sessionData.unionid;

        if (!openid) {
            console.error('小程序登录未返回 openid:', sessionData);
            return res.status(500).json({ success: false, message: '未获取到 openid' });
        }

        const upsertSql = `
            INSERT INTO wechat_customers (openid, unionid)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE unionid = VALUES(unionid)
        `;

        db.query(upsertSql, [openid, unionid || null], (upsertErr) => {
            if (upsertErr) {
                console.error('写入 wechat_customers 失败:', upsertErr);
                return res.status(500).json({ success: false, message: '服务器错误' });
            }

            db.query('SELECT customer_id FROM wechat_customers WHERE openid = ? LIMIT 1', [openid], (queryErr, rows) => {
                if (queryErr) {
                    console.error('查询 wechat_customers 失败:', queryErr);
                    return res.status(500).json({ success: false, message: '服务器错误' });
                }

                const boundCustomerId = rows && rows.length > 0 ? rows[0].customer_id : null;

                createWechatMpSession(openid, boundCustomerId, (sessionCreateErr, sessionInfo) => {
                    if (sessionCreateErr) {
                        return res.status(500).json({ success: false, message: '创建会话失败' });
                    }

                    res.json({
                        success: true,
                        data: {
                            token: sessionInfo.token,
                            expiresAt: sessionInfo.expiresAt,
                            hasBoundCustomer: !!boundCustomerId
                        }
                    });
                });
            });
        });
    });
});

// 微信小程序：绑定客户
app.post('/api/wechat/mp/bind-customer', authenticateWechatMp, (req, res) => {
    const auth = req.wechatMpAuth;
    const { customerKeyword, mobile } = req.body || {};

    if (!customerKeyword || !mobile) {
        return res.status(400).json({ success: false, message: '请填写客户名称/编号和手机号' });
    }

    const querySql = `
        SELECT 
            c.id AS customer_id,
            c.name AS customer_name,
            ca.customer_code,
            c.contact_person,
            c.phone
        FROM customers c
        LEFT JOIN customer_accounts ca ON ca.customer_id = c.id
        WHERE (ca.customer_code = ? OR c.name = ?)
          AND c.phone = ?
        LIMIT 1
    `;

    db.query(querySql, [customerKeyword, customerKeyword, mobile], (queryErr, rows) => {
        if (queryErr) {
            console.error('根据关键字查询客户失败:', queryErr);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }

        if (!rows || rows.length === 0) {
            return res.status(404).json({ success: false, message: '未找到匹配的客户，请检查信息是否正确' });
        }

        const row = rows[0];
        const customerId = row.customer_id;

        const updateCustomerSql = `
            UPDATE wechat_customers
            SET customer_id = ?, contact_name = ?, mobile = ?
            WHERE openid = ?
        `;

        db.query(updateCustomerSql, [customerId, row.contact_person || null, row.phone || null, auth.openid], (updateErr) => {
            if (updateErr) {
                console.error('更新 wechat_customers 失败:', updateErr);
                return res.status(500).json({ success: false, message: '绑定客户失败' });
            }

            const updateSessionSql = 'UPDATE wechat_mp_sessions SET customer_id = ? WHERE token = ?';
            db.query(updateSessionSql, [customerId, auth.token], (sessionErr) => {
                if (sessionErr) {
                    console.error('更新小程序会话客户信息失败:', sessionErr);
                    return res.status(500).json({ success: false, message: '绑定客户失败' });
                }

                res.json({
                    success: true,
                    data: {
                        customerId: customerId,
                        customerName: row.customer_name,
                        customerCode: row.customer_code || null,
                    },
                });
            });
        });
    });
});

// 微信扫码登录入口（手机端）
app.get('/wechat/scan-login', (req, res) => {
    const loginToken = req.query.token;

    if (!loginToken) {
        return res.status(400).send('缺少登录 token');
    }

    db.query('SELECT token, status, expires_at FROM login_sessions WHERE token = ? LIMIT 1', [loginToken], (err, results) => {
        if (err) {
            console.error('检查登录 token 失败:', err);
            return res.status(500).send('服务器错误');
        }

        if (!results || results.length === 0) {
            return res.status(400).send('登录二维码已失效，请重新打开登录页面');
        }

        if (!WECHAT_APP_ID) {
            return res.status(500).send('微信服务号未配置');
        }

        getExternalBaseUrl((urlErr, baseUrl) => {
            const safeBaseUrl = (baseUrl || '').replace(/\/$/, '') || `http://localhost:${port}`;
            const redirectUri = encodeURIComponent(`${safeBaseUrl}/wechat/oauth-callback`);
            const state = encodeURIComponent(loginToken);

            // 使用 snsapi_base 即可获取 openid，无需用户额外确认
            const authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${WECHAT_APP_ID}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_base&state=${state}#wechat_redirect`;

            res.redirect(authUrl);
        });
    });
});

// 微信网页授权回调：根据 openid 绑定或创建用户，并标记登录会话已确认
app.get('/wechat/oauth-callback', (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    const loginToken = state;

    if (!code || !loginToken) {
        return res.status(400).send('缺少必要参数');
    }

    fetchWeChatOAuthAccessToken(code, (oauthErr, oauthData) => {
        if (oauthErr) {
            console.error('微信网页授权失败:', oauthErr);
            return res.status(500).send('微信授权失败，请稍后重试');
        }

        const openid = oauthData && oauthData.openid;
        if (!openid) {
            console.error('微信网页授权未返回 openid:', oauthData);
            return res.status(500).send('微信授权失败，未获取到 openid');
        }

        db.query('SELECT * FROM users WHERE wechat_openid = ? LIMIT 1', [openid], (userErr, users) => {
            if (userErr) {
                console.error('根据 openid 查询用户失败:', userErr);
                return res.status(500).send('服务器错误');
            }

            const finishLoginSession = (userId) => {
                const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
                db.query(
                    'UPDATE login_sessions SET status = ?, user_id = ?, expires_at = ? WHERE token = ?',
                    ['confirmed', userId, expiresAt, loginToken],
                    (updateErr) => {
                        if (updateErr) {
                            console.error('更新登录会话失败:', updateErr);
                            return res.status(500).send('服务器错误');
                        }

                        res.send('扫码成功，已登录电脑端，请回到电脑继续操作。');
                    }
                );
            };

            if (users && users.length > 0) {
                finishLoginSession(users[0].id);
            } else {
                const randomSuffix = openid.slice(-6);
                const newUsername = `wx_${randomSuffix}`;
                const placeholderPassword = 'wechat_login_only';

                const insertSql = `
                    INSERT INTO users (username, password, real_name, role, email, phone, status, wechat_openid)
                    VALUES (?, ?, ?, 'guest', NULL, NULL, 'active', ?)
                `;

                db.query(insertSql, [newUsername, placeholderPassword, '微信用户', openid], (insertErr, result) => {
                    if (insertErr) {
                        console.error('创建微信访客用户失败:', insertErr);
                        return res.status(500).send('服务器错误');
                    }

                    const newUserId = result.insertId;
                    finishLoginSession(newUserId);
                });
            }
        });
    });
});


// 仪表板（使用经营分析作为首页）
app.get('/dashboard', isAuthenticated, (req, res) => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    res.render('finance/business-analysis', {
        user: req.session.user,
        moment: moment,
        active: 'dashboard',
        pageTitle: '仪表板',
        currentYear,
        currentMonth
    });
});



// 基础信息管理路由
// 客户管理
app.get('/customers', isAuthenticated, (req, res) => {
    db.query('SELECT * FROM customers ORDER BY created_at DESC', (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        res.render('customers/index', { 
            customers: results, 
            user: req.session.user,
            moment: moment,
            active: 'customers',
            pageTitle: '客户管理'
        });
    });
});

// 添加客户页面
app.get('/customers/add', isAuthenticated, (req, res) => {
    res.render('customers/add', { 
        user: req.session.user,
        active: 'customers',
        pageTitle: '添加客户'
    });
});

// 添加客户
app.post('/customers/add', isAuthenticated, (req, res) => {
    const { name, contact_person, phone, email, address, credit_level, id_card, business_license } = req.body;
    
    db.query(
        'INSERT INTO customers (name, contact_person, phone, email, address, credit_level, id_card, business_license) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [name, contact_person, phone, email, address, credit_level, id_card, business_license],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('添加客户失败');
            }
            res.redirect('/customers');
        }
    );
});

// 客户消费详情页面
app.get('/customers/detail/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;

    // 查询客户信息
    db.query('SELECT * FROM customers WHERE id = ?', [id], (err, customerResult) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }

        if (!customerResult || customerResult.length === 0) {
            return res.status(404).send('客户不存在');
        }

        const customer = customerResult[0];

        // 查询客户账户
        db.query('SELECT * FROM customer_accounts WHERE customer_id = ?', [id], (err, accountResult) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }

            const account = accountResult && accountResult.length > 0 ? accountResult[0] : null;

            // 查询订单及设备明细
            const orderSql = `
                SELECT 
                    ro.id AS order_id,
                    ro.order_number,
                    ro.status,
                    roi.id AS item_id,
                    roi.daily_rate,
                    roi.monthly_rate,
                    roi.start_date,
                    roi.end_date,
                    roi.actual_return_date,
                    d.device_code,
                    p.name AS product_name,
                    DATEDIFF(COALESCE(roi.actual_return_date, roi.end_date, CURDATE()), roi.start_date) + 1 AS days,
                    (CASE 
                        WHEN roi.daily_rate IS NOT NULL THEN roi.daily_rate
                        WHEN roi.monthly_rate IS NOT NULL THEN roi.monthly_rate / 30
                        ELSE 0
                    END) * (DATEDIFF(COALESCE(roi.actual_return_date, roi.end_date, CURDATE()), roi.start_date) + 1) AS consumed_amount
                FROM rental_orders ro
                LEFT JOIN rental_order_items roi ON ro.id = roi.order_id
                LEFT JOIN devices d ON roi.device_id = d.id
                LEFT JOIN products p ON d.product_id = p.id
                WHERE ro.customer_id = ?
                ORDER BY ro.order_date DESC, ro.id, roi.id
            `;

            db.query(orderSql, [id], (err, orderItems) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器错误');
                }

                // 添加状态文本
                orderItems.forEach(item => {
                    let statusText = '待生效';
                    if (item.status === 'active') statusText = '在租';
                    else if (item.status === 'expired') statusText = '已到期';
                    else if (item.status === 'returned') statusText = '已退租';
                    else if (item.status === 'cancelled') statusText = '已取消';
                    item.status_text = statusText;
                    if (!item.consumed_amount) item.consumed_amount = 0;
                });

                // 读取历史账单（从 customer_bills 表）
                db.query(
                    'SELECT * FROM customer_bills WHERE customer_id = ? ORDER BY bill_date DESC, id DESC',
                    [id],
                    (err, bills) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).send('服务器错误');
                        }

                        // 查询交易记录
                        db.query(
                            `SELECT * FROM customer_transaction_details WHERE customer_id = ? ORDER BY transaction_date DESC LIMIT 50`,
                            [id],
                            (err, transactions) => {
                                if (err) {
                                    console.error(err);
                                    return res.status(500).send('服务器错误');
                                }

                                res.render('customers/detail', {
                                    customer,
                                    account,
                                    orderItems,
                                    bills,
                                    transactions,
                                    user: req.session.user,
                                    active: 'customers',
                                    pageTitle: '客户消费详情',
                                    moment: moment
                                });
                            }
                        );
                    }
                );
            });
        });
    });
});

// 编辑客户页面
app.get('/customers/edit/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    
    db.query('SELECT * FROM customers WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (results.length === 0) {
            return res.status(404).send('客户不存在');
        }
        
        res.render('customers/edit', { 
            customer: results[0], 
            user: req.session.user,
            active: 'customers',
            pageTitle: '编辑客户'
        });
    });
});

// 更新客户
app.post('/customers/edit/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const { name, contact_person, phone, email, address, credit_level, id_card, business_license, status } = req.body;
    
    db.query(
        'UPDATE customers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, credit_level = ?, id_card = ?, business_license = ?, status = ? WHERE id = ?',
        [name, contact_person, phone, email, address, credit_level, id_card, business_license, status, id],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('更新客户失败');
            }
            res.redirect('/customers');
        }
    );
});

// 删除客户
app.delete('/customers/delete/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    
    db.query('DELETE FROM customers WHERE id = ?', [id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true });
    });
});

// 根据订单ID查看该订单关联的账单（跳转到最新一期账单）
app.get('/customers/:customerId/bills/order/:orderId', isAuthenticated, (req, res) => {
    const { customerId, orderId } = req.params;

    // 查找包含该订单的最新一期账单
    const sql = `
        SELECT cb.* 
        FROM customer_bills cb
        INNER JOIN rental_orders ro ON ro.customer_id = cb.customer_id
        WHERE cb.customer_id = ? 
        AND ro.id = ?
        AND ro.start_date <= cb.period_end
        AND (ro.end_date IS NULL OR ro.end_date >= cb.period_start)
        ORDER BY cb.period_start DESC
        LIMIT 1
    `;

    db.query(sql, [customerId, orderId], (err, bills) => {
        if (err) {
            console.error('查询订单对应账单失败:', err);
            return res.status(500).send('服务器错误');
        }

        if (!bills || bills.length === 0) {
            return res.status(404).send('该订单暂无账单记录，可能账单尚未生成');
        }

        // 重定向到账单详情页
        const bill = bills[0];
        res.redirect(`/customers/${customerId}/bills/${bill.id}`);
    });
});

// 账单详情（按客户+账期汇总，多订单合并）
app.get('/customers/:customerId/bills/:billId', isAuthenticated, (req, res) => {
    const { customerId, billId } = req.params;

    db.query('SELECT * FROM customers WHERE id = ?', [customerId], (err, customerResult) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        if (!customerResult || customerResult.length === 0) {
            return res.status(404).send('客户不存在');
        }
        const customer = customerResult[0];

        db.query('SELECT * FROM customer_accounts WHERE customer_id = ?', [customerId], (err, accountResult) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            const account = accountResult && accountResult.length > 0 ? accountResult[0] : null;

            db.query('SELECT * FROM customer_bills WHERE id = ? AND customer_id = ?', [billId, customerId], (err, billRows) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器错误');
                }
                if (!billRows || billRows.length === 0) {
                    return res.status(404).send('账单不存在');
                }
                const bill = billRows[0];

                const itemsSql = `
                    SELECT 
                        ro.id AS order_id,
                        ro.order_number,
                        roi.id AS item_id,
                        roi.daily_rate,
                        roi.monthly_rate,
                        roi.start_date,
                        roi.end_date,
                        roi.actual_return_date,
                        roi.device_code,
                        roi.specifications,
                        d.serial_number,
                        d.device_name,
                        d.id AS device_id,
                        p.name AS product_name,
                        p.product_code,
                        (
                            SELECT SUM(COALESCE(da.purchase_price, 0) * da.quantity)
                            FROM device_assemblies da
                            WHERE da.device_id = d.id
                        ) AS device_value
                    FROM rental_orders ro
                    LEFT JOIN rental_order_items roi ON ro.id = roi.order_id
                    LEFT JOIN devices d ON roi.device_id = d.id
                    LEFT JOIN products p ON d.product_id = p.id
                    WHERE ro.customer_id = ?
                `;

                db.query(itemsSql, [customerId], (err, allItems) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('服务器错误');
                    }

                    // 查询上一期账单
                    const previousBillSql = `
                        SELECT * FROM customer_bills 
                        WHERE customer_id = ? 
                        AND period_end < ? 
                        ORDER BY period_end DESC 
                        LIMIT 1
                    `;

                    db.query(previousBillSql, [customerId, bill.period_start], (err, previousBills) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).send('服务器错误');
                        }

                        const previousBill = previousBills.length > 0 ? previousBills[0] : null;
                        let previousBillItems = {};

                        const processBillItems = () => {
                            const periodStart = new Date(bill.period_start);
                            const periodEnd = new Date(bill.period_end);
                            
                            // 日期标准化函数
                            function normalizeToStartOfDay(date) {
                                const d = new Date(date);
                                d.setHours(0, 0, 0, 0);
                                return d;
                            }

                            // 计算本账单周期的完整月数
                            const getCycleMonths = (paymentCycle) => {
                                if (paymentCycle === 'monthly') return 1;
                                if (paymentCycle === 'quarterly') return 3;
                                if (paymentCycle === 'yearly') return 12;
                                return 3;
                            };
                            const cycleMonths = getCycleMonths(bill.payment_cycle);

                            // 计算两个日期之间的完整月数
                            const getMonthsBetween = (start, end) => {
                                const startDate = new Date(start);
                                const endDate = new Date(end);
                                
                                const days = Math.floor((endDate - startDate) / (24 * 3600 * 1000)) + 1;
                                
                                if (Math.abs(days - 30) <= 1) return 1;
                                if (Math.abs(days - 91) <= 2) return 3;
                                if (Math.abs(days - 365) <= 2) return 12;
                                
                                return 0;
                            };

                            // 查询所有订单的租金调整历史
                            const orderIds = allItems.map(it => it.order_id).filter((v, i, a) => a.indexOf(v) === i);
                            if (orderIds.length === 0) {
                                return finishProcessing([]);
                            }

                            const adjustmentsSql = `
                                SELECT 
                                    order_item_id,
                                    old_monthly_rate,
                                    new_monthly_rate,
                                    adjust_effective_date
                                FROM rental_rent_adjustments
                                WHERE order_id IN (${orderIds.map(() => '?').join(',')})
                                ORDER BY order_item_id, adjust_effective_date
                            `;

                            db.query(adjustmentsSql, orderIds, (err, adjustments) => {
                                if (err) {
                                    console.error('查询租金调整历史失败:', err);
                                    adjustments = [];
                                }

                                // 将调整历史按 order_item_id 分组
                                const adjustmentsByItem = {};
                                adjustments.forEach(adj => {
                                    if (!adjustmentsByItem[adj.order_item_id]) {
                                        adjustmentsByItem[adj.order_item_id] = [];
                                    }
                                    adjustmentsByItem[adj.order_item_id].push(adj);
                                });

                                const billItems = [];

                                allItems.forEach(it => {
                                    if (!it.start_date) return;
                                    const itemStart = new Date(it.start_date);
                                    
                                    // 修正：如果设备已退租，使用退租日期；否则使用账单period_end
                                    let itemEnd;
                                    if (it.actual_return_date) {
                                        itemEnd = new Date(it.actual_return_date);
                                    } else {
                                        itemEnd = new Date(bill.period_end);
                                    }

                                    const overlapStart = itemStart > periodStart ? itemStart : periodStart;
                                    const overlapEnd = itemEnd < periodEnd ? itemEnd : periodEnd;

                                    if (overlapStart > overlapEnd) return;

                                    // 获取该明细的租金调整历史
                                    const itemAdjustments = adjustmentsByItem[it.item_id] || [];

                                    let amount = 0;
                                    let days = 0;
                                    let adjustmentDetails = []; // 存储分段明细

                                    if (itemAdjustments.length === 0) {
                                        // 没有调整历史，直接用当前价格
                                        days = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (24 * 3600 * 1000)) + 1;
                                        const months = getMonthsBetween(overlapStart, overlapEnd);
                                        
                                        // 判断是否足月/足季度/足年
                                        if (months > 0 && it.monthly_rate) {
                                            // 足月/足季度/足年：按月租金 × 月数计算
                                            amount = parseFloat(it.monthly_rate) * months;
                                            console.log(`  账单明细按月租金计算: ${it.monthly_rate} × ${months}月 = ${amount.toFixed(2)}`);
                                        } else {
                                            // 不足月：按日租金 × 天数计算
                                            const dailyRate = it.daily_rate
                                                ? parseFloat(it.daily_rate)
                                                : it.monthly_rate
                                                ? parseFloat(it.monthly_rate) / 30
                                                : 0;
                                            amount = dailyRate * days;
                                            console.log(`  账单明细按日租金计算: ${dailyRate.toFixed(2)} × ${days}天 = ${amount.toFixed(2)}`);
                                        }
                                    } else {
                                        // 有调整历史，需要分段计算
                                        let currentStart = normalizeToStartOfDay(overlapStart);
                                        const normalizedEnd = normalizeToStartOfDay(overlapEnd);

                                        itemAdjustments.forEach((adj) => {
                                            const adjustDate = normalizeToStartOfDay(new Date(adj.adjust_effective_date));
                                            
                                            // 计算调整前的天数和费用（不包含调整当天）
                                            if (currentStart < adjustDate && currentStart <= normalizedEnd) {
                                                const segmentEnd = adjustDate < normalizedEnd ? new Date(adjustDate.getTime() - 24 * 3600 * 1000) : normalizedEnd;
                                                if (segmentEnd >= currentStart) {
                                                    const segmentDays = Math.floor((segmentEnd.getTime() - currentStart.getTime()) / (24 * 3600 * 1000)) + 1;
                                                    const dailyRate = parseFloat(adj.old_monthly_rate) / 30;
                                                    const segmentAmount = dailyRate * segmentDays;
                                                    
                                                    amount += segmentAmount;
                                                    days += segmentDays;
                                                    
                                                    adjustmentDetails.push({
                                                        start: new Date(currentStart),
                                                        end: new Date(segmentEnd),
                                                        days: segmentDays,
                                                        monthlyRate: adj.old_monthly_rate,
                                                        dailyRate: dailyRate.toFixed(2),
                                                        amount: segmentAmount.toFixed(2),
                                                        label: '调整前'
                                                    });
                                                }
                                                currentStart = adjustDate;
                                            }
                                        });

                                        // 计算调整后剩余时间的费用（从调整当天开始）
                                        if (currentStart <= normalizedEnd) {
                                            const segmentDays = Math.floor((normalizedEnd.getTime() - currentStart.getTime()) / (24 * 3600 * 1000)) + 1;
                                            const lastAdjustment = itemAdjustments[itemAdjustments.length - 1];
                                            const dailyRate = parseFloat(lastAdjustment.new_monthly_rate) / 30;
                                            const segmentAmount = dailyRate * segmentDays;
                                            
                                            amount += segmentAmount;
                                            days += segmentDays;
                                            
                                            adjustmentDetails.push({
                                                start: new Date(currentStart),
                                                end: new Date(normalizedEnd),
                                                days: segmentDays,
                                                monthlyRate: lastAdjustment.new_monthly_rate,
                                                dailyRate: dailyRate.toFixed(2),
                                                amount: segmentAmount.toFixed(2),
                                                label: '调整后'
                                            });
                                        }
                                    }

                                    const months = getMonthsBetween(overlapStart, overlapEnd);

                                    // 获取上期账单数据
                                    const prevData = previousBillItems[it.order_number] || {};

                                    billItems.push({
                                        ...it,
                                        days,
                                        months,
                                        period_start: overlapStart,
                                        period_end: overlapEnd,
                                        consumed_amount: amount,
                                        adjustment_details: adjustmentDetails, // 添加分段明细
                                        // 上期账单数据
                                        prev_period_start: prevData.period_start,
                                        prev_period_end: prevData.period_end,
                                        prev_days: prevData.days || 0,
                                        prev_months: prevData.months || 0,
                                        prev_amount: prevData.consumed_amount || 0
                                    });
                                });

                                finishProcessing(billItems);
                            });
                        };

                        function finishProcessing(billItems) {
                            const billTotalAmount = billItems.reduce((sum, item) => {
                                const amount = item && item.consumed_amount ? Number(item.consumed_amount) : 0;
                                return sum + (Number.isNaN(amount) ? 0 : amount);
                            }, 0);

                            const normalizedTotal = Number(billTotalAmount.toFixed(2));

                            if (!Number.isNaN(normalizedTotal) && bill && bill.id) {
                                db.query(
                                    'UPDATE customer_bills SET amount = ? WHERE id = ?',
                                    [normalizedTotal, bill.id],
                                    (updateErr) => {
                                        if (updateErr) {
                                            console.error('同步更新customer_bills.amount失败:', updateErr);
                                        }

                                        res.render('customers/bill-detail', {
                                            customer,
                                            account,
                                            bill,
                                            items: billItems,
                                            previousBill,
                                            billTotalAmount,
                                            user: req.session.user,
                                            active: 'customers',
                                            pageTitle: '账单详情',
                                            moment: moment,
                                        });
                                    },
                                );
                            } else {
                                res.render('customers/bill-detail', {
                                    customer,
                                    account,
                                    bill,
                                    items: billItems,
                                    previousBill,
                                    billTotalAmount,
                                    user: req.session.user,
                                    active: 'customers',
                                    pageTitle: '账单详情',
                                    moment: moment,
                                });
                            }
                        }



                        // 如果有上一期账单，查询上一期的明细
                        if (previousBill) {
                            db.query(itemsSql, [customerId], (err, prevAllItems) => {
                                if (err) {
                                    console.error(err);
                                    processBillItems();
                                    return;
                                }

                                const prevPeriodStart = new Date(previousBill.period_start);
                                const prevPeriodEnd = new Date(previousBill.period_end);

                                // 计算两个日期之间的完整月数（与本期相同的逻辑）
                                const getMonthsBetween = (start, end) => {
                                    const startDate = new Date(start);
                                    const endDate = new Date(end);
                                    
                                    const days = Math.floor((endDate - startDate) / (24 * 3600 * 1000)) + 1;
                                    
                                    if (Math.abs(days - 30) <= 1) return 1;
                                    if (Math.abs(days - 91) <= 2) return 3;
                                    if (Math.abs(days - 365) <= 2) return 12;
                                    
                                    return 0;
                                };

                                // 计算上期账单每个设备的数据
                                prevAllItems.forEach(it => {
                                    if (!it.start_date) return;
                                    const itemStart = new Date(it.start_date);
                                    
                                    // 修正：如果设备已退租，使用退租日期；否则使用上期账单的period_end
                                    let itemEnd;
                                    if (it.actual_return_date) {
                                        itemEnd = new Date(it.actual_return_date);
                                    } else {
                                        itemEnd = new Date(previousBill.period_end);
                                    }

                                    const overlapStart = itemStart > prevPeriodStart ? itemStart : prevPeriodStart;
                                    const overlapEnd = itemEnd < prevPeriodEnd ? itemEnd : prevPeriodEnd;

                                    if (overlapStart > overlapEnd) return;

                                    const days = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (24 * 3600 * 1000)) + 1;
                                    const months = getMonthsBetween(overlapStart, overlapEnd);
                                    
                                    let amount = 0;

                                    if (months > 0 && it.monthly_rate) {
                                        // 足月/足季度/足年：按月租金 × 月数
                                        amount = parseFloat(it.monthly_rate) * months;
                                    } else {
                                        // 不足：按日租金 × 天数
                                        const dailyRate = it.daily_rate
                                            ? parseFloat(it.daily_rate)
                                            : it.monthly_rate
                                            ? parseFloat(it.monthly_rate) / 30
                                            : 0;
                                        amount = dailyRate * days;
                                    }

                                    previousBillItems[it.order_number] = {
                                        period_start: overlapStart,
                                        period_end: overlapEnd,
                                        days: days,
                                        months: months,
                                        consumed_amount: amount
                                    };
                                });

                                processBillItems();
                            });
                        } else {
                            processBillItems();
                        }
                    });
                });
            });
        });
    });
});

// 用户管理
app.get('/users', isAuthenticated, checkRole('admin'), (req, res) => {
    db.query('SELECT * FROM users ORDER BY created_at DESC', (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        res.render('users/index', { 
            users: results, 
            user: req.session.user,
            moment: moment,
            active: 'users',
            pageTitle: '用户管理'
        });
    });
});

// 添加用户页面
app.get('/users/add', isAuthenticated, checkRole('admin'), (req, res) => {
    res.render('users/add', { 
        user: req.session.user,
        active: 'users',
        pageTitle: '添加用户'
    });
});

// 添加用户
app.post('/users/add', isAuthenticated, checkRole('admin'), (req, res) => {
    const { username, password, real_name, role, email, phone } = req.body;
    
    // 简化密码处理（实际项目中应该使用bcrypt）
    db.query(
        'INSERT INTO users (username, password, real_name, role, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
        [username, password, real_name, role, email, phone],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('添加用户失败');
            }
            res.redirect('/users');
        }
    );
});

// 编辑用户页面
app.get('/users/edit/:id', isAuthenticated, checkRole('admin'), (req, res) => {
    const { id } = req.params;
    
    db.query('SELECT * FROM users WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (results.length === 0) {
            return res.status(404).send('用户不存在');
        }
        
        res.render('users/edit', { 
            user: req.session.user,
            userToEdit: results[0], 
            active: 'users',
            pageTitle: '编辑用户'
        });
    });
});

// 更新用户
app.post('/users/edit/:id', isAuthenticated, checkRole('admin'), (req, res) => {
    const { id } = req.params;
    const { username, password, real_name, role, email, phone, status } = req.body;
    
    // 如果密码为空，则不更新密码
    if (password) {
        db.query(
            'UPDATE users SET username = ?, password = ?, real_name = ?, role = ?, email = ?, phone = ?, status = ? WHERE id = ?',
            [username, password, real_name, role, email, phone, status, id],
            (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('更新用户失败');
                }
                res.redirect('/users');
            }
        );
    } else {
        db.query(
            'UPDATE users SET username = ?, real_name = ?, role = ?, email = ?, phone = ?, status = ? WHERE id = ?',
            [username, real_name, role, email, phone, status, id],
            (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('更新用户失败');
                }
                res.redirect('/users');
            }
        );
    }
});

// 删除用户
app.delete('/users/delete/:id', isAuthenticated, checkRole('admin'), (req, res) => {
    const { id } = req.params;
    
    db.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true });
    });
});

// 供应商管理
app.get('/suppliers', isAuthenticated, (req, res) => {
    db.query('SELECT * FROM suppliers ORDER BY created_at DESC', (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        res.render('suppliers/index', { 
            suppliers: results, 
            user: req.session.user,
            moment: moment,
            active: 'suppliers',
            pageTitle: '供应商管理'
        });
    });
});

// 添加供应商页面
app.get('/suppliers/add', isAuthenticated, (req, res) => {
    res.render('suppliers/add', { 
        user: req.session.user,
        active: 'suppliers',
        pageTitle: '添加供应商'
    });
});

// 添加供应商
app.post('/suppliers/add', isAuthenticated, (req, res) => {
    const { name, contact_person, phone, email, address, business_license, bank_account } = req.body;
    
    db.query(
        'INSERT INTO suppliers (name, contact_person, phone, email, address, business_license, bank_account) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, contact_person, phone, email, address, business_license, bank_account],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('添加供应商失败');
            }
            res.redirect('/suppliers');
        }
    );
});

// 编辑供应商页面
app.get('/suppliers/edit/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    
    db.query('SELECT * FROM suppliers WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (results.length === 0) {
            return res.status(404).send('供应商不存在');
        }
        
        res.render('suppliers/edit', { 
            supplier: results[0], 
            user: req.session.user,
            active: 'suppliers',
            pageTitle: '编辑供应商'
        });
    });
});

// 更新供应商
app.post('/suppliers/edit/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const { name, contact_person, phone, email, address, business_license, bank_account, status } = req.body;
    
    db.query(
        'UPDATE suppliers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, business_license = ?, bank_account = ?, status = ? WHERE id = ?',
        [name, contact_person, phone, email, address, business_license, bank_account, status, id],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('更新供应商失败');
            }
            res.redirect('/suppliers');
        }
    );
});

// 删除供应商
app.delete('/suppliers/delete/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    
    db.query('DELETE FROM suppliers WHERE id = ?', [id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true });
    });
});

// 客户消费管理页面
app.get('/customer-billing', isAuthenticated, (req, res) => {
    res.render('customer-billing', { 
        user: req.session.user,
        active: 'customer-billing',
        pageTitle: '客户消费管理'
    });
});

// 基础信息管理整合页面
app.get('/basic-info', isAuthenticated, (req, res) => {
    res.render('basic-info/index', { 
        user: req.session.user,
        active: 'basic-info',
        pageTitle: '基础信息管理'
    });
});

// ==================== 租金管理路由 ====================
require('./rent-management-routes')(app, db, isAuthenticated);

// 合作伙伴管理
app.get('/partners', isAuthenticated, (req, res) => {
    db.query('SELECT * FROM partners ORDER BY created_at DESC', (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        res.render('partners/index', { 
            partners: results, 
            user: req.session.user,
            moment: moment,
            active: 'partners',
            pageTitle: '合作伙伴管理'
        });
    });
});

// 添加合作伙伴页面
app.get('/partners/add', isAuthenticated, (req, res) => {
    res.render('partners/add', { 
        user: req.session.user,
        active: 'partners',
        pageTitle: '添加合作伙伴'
    });
});



// 编辑合作伙伴页面
app.get('/partners/edit/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    
    db.query('SELECT * FROM partners WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (results.length === 0) {
            return res.status(404).send('合作伙伴不存在');
        }
        
        res.render('partners/edit', { 
            partner: results[0], 
            user: req.session.user,
            active: 'partners',
            pageTitle: '编辑合作伙伴'
        });
    });
});





// 产品管理
app.get('/products', isAuthenticated, (req, res) => {
    db.query('SELECT p.*, pc.name as category_name FROM products p LEFT JOIN product_categories pc ON p.category_id = pc.id ORDER BY p.created_at DESC', (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        res.render('products/index', { 
            products: results, 
            user: req.session.user,
            moment: moment,
            active: 'products',
            pageTitle: '产品管理'
        });
    });
});

// 产品类别管理
// 产品类别列表
app.get('/categories', isAuthenticated, (req, res) => {
    db.query('SELECT * FROM product_categories ORDER BY name', (err, categories) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        res.render('categories/index', {
            categories: categories,
            user: req.session.user,
            active: 'categories',
            pageTitle: '产品类别管理'
        });
    });
});

// 添加产品类别页面
app.get('/categories/add', isAuthenticated, (req, res) => {
    res.render('categories/add', {
        user: req.session.user,
        active: 'categories',
        pageTitle: '添加产品类别'
    });
});

// 添加产品类别处理
app.post('/categories/add', isAuthenticated, (req, res) => {
    const { name, description } = req.body;
    
    if (!name) {
        return res.status(400).send('类别名称不能为空');
    }
    
    db.query('INSERT INTO product_categories (name, description) VALUES (?, ?)', [name, description], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        res.redirect('/categories?message=类别添加成功');
    });
});

// 编辑产品类别页面
app.get('/categories/edit/:id', isAuthenticated, (req, res) => {
    const categoryId = req.params.id;
    
    db.query('SELECT * FROM product_categories WHERE id = ?', [categoryId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (results.length === 0) {
            return res.status(404).send('类别不存在');
        }
        
        res.render('categories/edit', {
            category: results[0],
            user: req.session.user,
            active: 'categories',
            pageTitle: '编辑产品类别'
        });
    });
});

// 编辑产品类别处理
app.post('/categories/edit/:id', isAuthenticated, (req, res) => {
    const categoryId = req.params.id;
    const { name, description } = req.body;
    
    if (!name) {
        return res.status(400).send('类别名称不能为空');
    }
    
    db.query('UPDATE product_categories SET name = ?, description = ? WHERE id = ?', [name, description, categoryId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        res.redirect('/categories?message=类别更新成功');
    });
});

// 删除产品类别
app.post('/categories/delete/:id', isAuthenticated, (req, res) => {
    const categoryId = req.params.id;
    
    // 检查是否有产品使用此类别
    db.query('SELECT COUNT(*) AS count FROM products WHERE category_id = ?', [categoryId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (results[0].count > 0) {
            return res.redirect('/categories?message=无法删除，该类别下还有产品');
        }
        
        // 删除类别
        db.query('DELETE FROM product_categories WHERE id = ?', [categoryId], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            res.redirect('/categories?message=类别删除成功');
        });
    });
});

// API: 获取产品类别列表
app.get('/api/categories', isAuthenticated, (req, res) => {
    db.query('SELECT * FROM product_categories ORDER BY name', (err, categories) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: '服务器错误' });
        }
        res.json(categories);
    });
});

// 产品管理页面
app.get('/products', isAuthenticated, (req, res) => {
    // 获取所有产品
    db.query(`
        SELECT p.*, c.name as category_name 
        FROM products p 
        LEFT JOIN product_categories c ON p.category_id = c.id 
        ORDER BY p.created_at DESC
    `, (err, products) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 获取产品类别
        db.query('SELECT * FROM product_categories ORDER BY name', (err, categories) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            res.render('products/index-new', { 
                products: products,
                categories: categories,
                user: req.session.user,
                active: 'products',
                pageTitle: '产品型号管理'
            });
        });
    });
});


// 添加产品页面
app.get('/products/add', isAuthenticated, (req, res) => {
    // 获取产品类别
    db.query('SELECT * FROM product_categories ORDER BY name', (err, categories) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 获取各分类配件
        const accessoryQueries = [
            'CPU',
            '散热器',
            '主板',
            '内存',
            '硬盘',
            '显卡',
            '机箱',
            '电源',
            '显示器'
        ];
        
        const queryPromises = accessoryQueries.map(categoryName => {
            return new Promise((resolve, reject) => {
                // 使用子查询获取每个配件的最新批次价格
                const query = `
                    SELECT a.*, 
                    IFNULL(
                        (SELECT pai.unit_price 
                        FROM purchase_accessory_items pai
                        JOIN purchase_batches pb ON pai.batch_id = pb.id
                        WHERE pai.accessory_id = a.id AND pb.status IN ('delivered', 'completed')
                        ORDER BY pb.purchase_date DESC, pb.id DESC
                        LIMIT 1), 
                        a.unit_price
                    ) as latest_price
                    FROM accessories a 
                    WHERE a.category_id = (SELECT id FROM accessory_categories WHERE name = ?)
                `;
                
                db.query(query, [categoryName], (err, results) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            });
        });
        
        Promise.all(queryPromises)
            .then(results => {
                res.render('products/add-new', { 
                    categories: categories,
                    cpuList: results[0],
                    coolerList: results[1],
                    motherboardList: results[2],
                    memoryList: results[3],
                    storageList: results[4],
                    graphicsList: results[5],
                    caseList: results[6],
                    powerList: results[7],
                    monitorList: results[8],
                    user: req.session.user,
                    active: 'products',
                    pageTitle: '添加产品型号'
                });
            })
            .catch(err => {
                console.error(err);
                res.status(500).send('服务器错误');
            });
    });
});

// 获取下一个产品编号API
app.get('/api/get-next-product-code', isAuthenticated, (req, res) => {
    // 查询当前最大的产品编号
    db.query('SELECT product_code FROM products WHERE product_code IS NOT NULL ORDER BY product_code DESC LIMIT 1', (err, result) => {
        if (err) {
            console.error('查询产品编号失败:', err);
            return res.status(500).json({ error: '查询产品编号失败' });
        }
        
        let nextNumber = 1;
        if (result.length > 0) {
            // 从当前最大编号提取数字部分
            const currentCode = result[0].product_code;
            const match = currentCode.match(/PC(\d+)/);
            if (match) {
                nextNumber = parseInt(match[1]) + 1;
            }
        }
        
        // 生成新编号，格式为PC0001
        const nextCode = 'PC' + String(nextNumber).padStart(4, '0');
        
        res.json({ productCode: nextCode });
    });
});


// 添加产品
app.post('/products/add', isAuthenticated, (req, res) => {
    const { 
        product_code,
        model_number,
        category_id, 
        name, 
        brand, 
        model, 
        specifications, 
        purchase_price,
        total_price,
        calculated_daily_rent,
        calculated_monthly_rent,
        // 笔记本电脑专用字段
        laptop_brand,
        laptop_model,
        laptop_cpu,
        laptop_memory,
        laptop_storage,
        laptop_graphics,
        laptop_screen,
        laptop_purchase_price
    } = req.body;
    
    // 获取配件数据
    const accessories = {};
    if (req.body.accessories) {
        if (typeof req.body.accessories === 'string') {
            // 单个配件
            accessories[Object.keys(req.body.accessories)[0]] = req.body.accessories[Object.keys(req.body.accessories)[0]];
        } else {
            // 多个配件
            Object.assign(accessories, req.body.accessories);
        }
    }
    
    // 查询类别名称
    db.query('SELECT name FROM product_categories WHERE id = ?', [category_id], (err, categoryResult) => {
        if (err) {
            console.error(err);
            return res.status(500).send('查询类别失败');
        }
        
        const categoryName = categoryResult.length > 0 ? categoryResult[0].name : '';
        const isDesktop = categoryName.includes('台式电脑');
        const isLaptop = categoryName.includes('笔记本电脑');
        
        // 准备产品数据
        let productData = {
            product_code: product_code,
            model_number: isDesktop ? model_number : null,
            category_id: category_id,
            name: name,
            brand: brand || null,
            model: model || null,
            specifications: specifications || null,
            total_price: total_price || purchase_price || 0,
            calculated_daily_rent: calculated_daily_rent || 0,
            calculated_monthly_rent: calculated_monthly_rent || 0
        };
        
        // 如果是笔记本电脑，使用笔记本电脑专用的品牌和型号
        if (isLaptop) {
            productData.brand = laptop_brand || null;
            productData.model = laptop_model || null;
            
            // 将笔记本电脑的配置信息合并到规格字段中
            const laptopSpecs = [];
            if (laptop_cpu) laptopSpecs.push(`CPU: ${laptop_cpu}`);
            if (laptop_memory) laptopSpecs.push(`内存: ${laptop_memory}`);
            if (laptop_storage) laptopSpecs.push(`硬盘: ${laptop_storage}`);
            if (laptop_graphics) laptopSpecs.push(`显卡: ${laptop_graphics}`);
            if (laptop_screen) laptopSpecs.push(`屏幕: ${laptop_screen}`);
            
            if (laptopSpecs.length > 0) {
                productData.specifications = productData.specifications 
                    ? `${productData.specifications} | ${laptopSpecs.join(', ')}`
                    : laptopSpecs.join(', ');
            }
            
            // 使用笔记本电脑的采购价格
            if (laptop_purchase_price) {
                productData.total_price = parseFloat(laptop_purchase_price) || 0;
            }
        }
        
        // 插入产品
        db.query('INSERT INTO products SET ?', productData, (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('添加产品失败');
            }
            
            const productId = result.insertId;
            
            // 如果是台式电脑，插入配件关联
            if (isDesktop && Object.keys(accessories).length > 0) {
                const accessoryEntries = Object.entries(accessories)
                    .filter(([key, value]) => value) // 过滤掉空值
                    .map(([type, accessoryId]) => [productId, accessoryId, 1]);
                
                if (accessoryEntries.length > 0) {
                    const sql = 'INSERT INTO product_accessories (product_id, accessory_id, quantity) VALUES ?';
                    const placeholders = accessoryEntries.map(() => '(?, ?, ?)').join(', ');
                    const values = accessoryEntries.flat();
                    
                    db.query(sql.replace('?', placeholders), values, (err) => {
                        if (err) {
                            console.error('插入产品配件关联失败:', err);
                        } else {
                            // 在device_templates表中创建配件模板，防止"该产品未维护详细配件清单"的提示
                            createDeviceTemplatesForProduct(productId, product_code, name, accessoryEntries);
                        }
                    });
                } else if (isDesktop) {
                    // 即使没有选择配件，也为台式电脑创建基本模板结构
                    createBasicDeviceTemplatesForProduct(productId, product_code, name);
                }
            }
            
            res.redirect('/products');
        });
    });
});

// 为产品创建设备模板的辅助函数
function createDeviceTemplatesForProduct(productId, productCode, productName, accessoryEntries) {
    console.log(`为产品 ${productCode} 创建设备模板...`);
    
    // 使用事务确保数据一致性
    db.beginTransaction(err => {
        if (err) {
            console.error('开始事务失败:', err);
            return;
        }
        
        // 遍历每个配件，创建模板项
        let completed = 0;
        const total = accessoryEntries.length;
        
        if (total === 0) {
            // 如果没有配件，创建基本模板结构
            createBasicDeviceTemplatesInTransaction(productId, productCode, productName, () => {
                db.commit(err => {
                    if (err) {
                        console.error('提交事务失败:', err);
                        db.rollback();
                    } else {
                        console.log(`为产品 ${productCode} 创建基本设备模板成功`);
                    }
                });
            });
            return;
        }
        
        // 为每个配件创建模板项
        accessoryEntries.forEach(([productId, accessoryId, quantity]) => {
            // 获取配件详细信息
            db.query(`
                SELECT a.id, a.name, ac.name as category_name, a.brand, a.model, ac.id as category_id
                FROM accessories a
                JOIN accessory_categories ac ON a.category_id = ac.id
                WHERE a.id = ?
            `, [accessoryId], (err, accessoryResult) => {
                if (err || accessoryResult.length === 0) {
                    console.error(`获取配件 ${accessoryId} 信息失败:`, err);
                    return;
                }
                
                const accessory = accessoryResult[0];
                
                // 在device_templates中创建模板项
                db.query(`
                    INSERT INTO device_templates (
                        product_id, product_code, product_name, accessory_category_id, 
                        accessory_name, brand, model, quantity, is_required, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    productId,
                    productCode,
                    productName,
                    accessory.category_id,
                    accessory.name,
                    accessory.brand || '',
                    accessory.model || accessory.name,
                    quantity || 1,
                    1,  // 必需
                    `${accessory.brand} ${accessory.model || accessory.name} - 自动生成于产品创建`
                ], (err) => {
                    if (err) {
                        console.error(`创建设备模板项失败:`, err);
                    } else {
                        console.log(`为产品 ${productCode} 创建 ${accessory.name} 模板成功`);
                    }
                    
                    completed++;
                    if (completed === total) {
                        // 所有模板项创建完成，提交事务
                        db.commit(err => {
                            if (err) {
                                console.error('提交事务失败:', err);
                                db.rollback();
                            } else {
                                console.log(`为产品 ${productCode} 创建设备模板成功`);
                            }
                        });
                    }
                });
            });
        });
    });
}

// 为台式电脑创建基本设备模板结构的辅助函数
function createBasicDeviceTemplatesForProduct(productId, productCode, productName) {
    console.log(`为产品 ${productCode} 创建基本设备模板结构...`);
    
    db.beginTransaction(err => {
        if (err) {
            console.error('开始事务失败:', err);
            return;
        }
        
        createBasicDeviceTemplatesInTransaction(productId, productCode, productName, () => {
            db.commit(err => {
                if (err) {
                    console.error('提交事务失败:', err);
                    db.rollback();
                } else {
                    console.log(`为产品 ${productCode} 创建基本设备模板成功`);
                }
            });
        });
    });
}

// 在事务中创建基本设备模板结构
function createBasicDeviceTemplatesInTransaction(productId, productCode, productName, callback) {
    // 获取所有配件类别
    db.query('SELECT * FROM accessory_categories ORDER BY name', (err, categories) => {
        if (err || categories.length === 0) {
            console.error('获取配件类别失败:', err);
            return;
        }
        
        // 为每个配件类别创建一个基本的模板项（标记为非必需）
        let completed = 0;
        const total = categories.length;
        
        categories.forEach(category => {
            db.query(`
                INSERT INTO device_templates (
                    product_id, product_code, product_name, accessory_category_id, 
                    accessory_name, brand, model, quantity, is_required, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            `, [
                productId,
                productCode,
                productName,
                category.id,
                `${category.name} - 待配置`,
                '',
                '',
                0,
                `基本模板项 - ${category.name} - 请配置具体配件`
            ], (err) => {
                if (err) {
                    console.error(`创建基本设备模板项失败:`, err);
                } else {
                    console.log(`为产品 ${productCode} 创建基本 ${category.name} 模板成功`);
                }
                
                completed++;
                if (completed === total && callback) {
                    callback();
                }
            });
        });
    });
}

// 查看产品详情页面
app.get('/products/view/:id', isAuthenticated, (req, res) => {
    const productId = req.params.id;
    
    // 获取产品基本信息
    db.query('SELECT p.*, c.name as category_name FROM products p LEFT JOIN product_categories c ON p.category_id = c.id WHERE p.id = ?', 
        [productId], (err, productResult) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            if (productResult.length === 0) {
                return res.status(404).send('产品不存在');
            }
            
            const product = productResult[0];
            
            // 如果是台式电脑，获取配件详情
            if (product.category_name && product.category_name.includes('台式电脑')) {
                db.query(`
                    SELECT a.*, ac.name as category_name
                    FROM product_accessories pa
                    JOIN accessories a ON pa.accessory_id = a.id
                    JOIN accessory_categories ac ON a.category_id = ac.id
                    WHERE pa.product_id = ?
                `, [productId], (err, accessories) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('服务器错误');
                    }
                    
                    res.render('products/view', {
                        product: product,
                        accessories: accessories,
                        user: req.session.user,
                        active: 'products',
                        pageTitle: '产品详情 - ' + product.name,
                        moment: moment
                    });
                });
            } else {
                // 非台式电脑，不显示配件
                res.render('products/view', {
                    product: product,
                    accessories: [],
                    user: req.session.user,
                    active: 'products',
                    pageTitle: '产品详情 - ' + product.name,
                    moment: moment
                });
            }
        });
});

// 获取产品配置（供设备组装页面使用）
app.get('/products/config/:id', isAuthenticated, (req, res) => {
    const productId = req.params.id;

    // 先获取产品信息，以便拿到 product_code 和基本信息
    db.query('SELECT * FROM products WHERE id = ?', [productId], (err, products) => {
        if (err) {
            console.error('查询产品信息失败:', err);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }

        if (!products || products.length === 0) {
            return res.status(404).json({ success: false, message: '产品不存在' });
        }

        const product = products[0];
        const productCode = product.product_code || product.code;

        // 如果没有产品编码，则认为没有维护模板，直接返回空配置和总价
        if (!productCode) {
            return res.json({
                success: true,
                accessories: [],
                total_price: product.total_price || product.purchase_price || 0
            });
        }

        // 从 device_templates + accessories 中获取该产品的标准配置清单
        db.query(`
            SELECT 
                dt.accessory_category_id,
                ac.name AS category_name,
                dt.accessory_name,
                dt.brand AS template_brand,
                dt.model AS template_model,
                dt.quantity,
                a.id AS accessory_id,
                a.name AS name,
                a.brand,
                a.model,
                a.unit_price,
                a.stock_quantity
            FROM device_templates dt
            LEFT JOIN accessory_categories ac ON dt.accessory_category_id = ac.id
            LEFT JOIN accessories a ON 
                a.category_id = dt.accessory_category_id AND
                a.brand = dt.brand AND
                a.model = dt.model
            WHERE dt.product_code = ?
            ORDER BY dt.accessory_category_id
        `, [productCode], (err, rows) => {
            if (err) {
                console.error('查询产品配置失败:', err);
                return res.status(500).json({ success: false, message: '查询产品配置失败' });
            }

            if (!rows || rows.length === 0) {
                // 没有维护模板，返回空配置和产品自身价格
                return res.json({
                    success: true,
                    accessories: [],
                    total_price: product.total_price || product.purchase_price || 0
                });
            }

            // 按 accessory_id（或类别+品牌+型号）去重，避免同一部件出现多行
            const accessoryMap = new Map();

            rows.forEach(row => {
                const keyBrand = row.brand || row.template_brand || '';
                const keyModel = row.model || row.template_model || '';
                const key = row.accessory_id
                    ? `id:${row.accessory_id}`
                    : `tmpl:${row.accessory_category_id}:${keyBrand}:${keyModel}`;

                const unitPrice = row.unit_price ? parseFloat(row.unit_price) : 0;
                const quantity = row.quantity || 1;
                const stockQty = row.stock_quantity || 0;

                let item = accessoryMap.get(key);
                if (!item) {
                    item = {
                        accessory_id: row.accessory_id,
                        category_name: row.category_name || row.accessory_name || '',
                        name: row.name || row.accessory_name || '',
                        brand: keyBrand,
                        model: keyModel,
                        unit_price: unitPrice,
                        stock_quantity: stockQty,
                        quantity: quantity
                    };
                    accessoryMap.set(key, item);
                } else {
                    // 同一配件重复时，累加库存即可
                    item.stock_quantity += stockQty;
                }
            });

            let totalPrice = 0;
            const accessories = Array.from(accessoryMap.values());
            accessories.forEach(item => {
                if (item.unit_price > 0) {
                    totalPrice += item.unit_price * item.quantity;
                }
            });

            // 如果模板没提供价格，但产品本身有总价，则用产品总价兜底
            const finalTotal = totalPrice > 0 
                ? totalPrice 
                : (product.total_price || product.purchase_price || 0);

            return res.json({
                success: true,
                accessories: accessories,
                total_price: finalTotal
            });
        });
    });
});

// 编辑产品页面
app.get('/products/edit/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    
    // 获取产品信息
    db.query('SELECT * FROM products WHERE id = ?', [id], (err, productResult) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (productResult.length === 0) {
            return res.status(404).send('产品不存在');
        }
        
        const product = productResult[0];
        
        // 获取所有类别
        db.query('SELECT * FROM product_categories ORDER BY name', (err, categories) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            // 创建类别名称到ID的映射
            const categoryMap = {};
            categories.forEach(cat => {
                categoryMap[cat.name] = cat.id;
            });
            
            // 查找产品的类别名称
            const productCategory = categories.find(cat => cat.id == product.category_id);
            const isComputerHost = productCategory && productCategory.name === '电脑主机';
            
            // 如果是电脑主机，获取配件数据和已关联的配件
            if (isComputerHost) {
                // 获取产品关联的配件
                db.query(`
                    SELECT pa.accessory_id, ac.name as category_name
                    FROM product_accessories pa
                    JOIN accessories a ON pa.accessory_id = a.id
                    JOIN accessory_categories ac ON a.category_id = ac.id
                    WHERE pa.product_id = ?
                `, [id], (err, productAccessories) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('服务器错误');
                    }
                    
                    // 获取所有配件类别
                    Promise.all([
                        new Promise((resolve, reject) => {
                            db.query('SELECT * FROM accessories WHERE category_id = (SELECT id FROM accessory_categories WHERE name = "CPU")', (err, results) => {
                                if (err) reject(err);
                                else resolve(results);
                            });
                        }),
                        new Promise((resolve, reject) => {
                            db.query('SELECT * FROM accessories WHERE category_id = (SELECT id FROM accessory_categories WHERE name = "散热器")', (err, results) => {
                                if (err) reject(err);
                                else resolve(results);
                            });
                        }),
                        new Promise((resolve, reject) => {
                            db.query('SELECT * FROM accessories WHERE category_id = (SELECT id FROM accessory_categories WHERE name = "主板")', (err, results) => {
                                if (err) reject(err);
                                else resolve(results);
                            });
                        }),
                        new Promise((resolve, reject) => {
                            db.query('SELECT * FROM accessories WHERE category_id = (SELECT id FROM accessory_categories WHERE name = "内存")', (err, results) => {
                                if (err) reject(err);
                                else resolve(results);
                            });
                        }),
                        new Promise((resolve, reject) => {
                            db.query('SELECT * FROM accessories WHERE category_id = (SELECT id FROM accessory_categories WHERE name = "硬盘")', (err, results) => {
                                if (err) reject(err);
                                else resolve(results);
                            });
                        }),
                        new Promise((resolve, reject) => {
                            db.query('SELECT * FROM accessories WHERE category_id = (SELECT id FROM accessory_categories WHERE name = "显卡")', (err, results) => {
                                if (err) reject(err);
                                else resolve(results);
                            });
                        }),
                        new Promise((resolve, reject) => {
                            db.query('SELECT * FROM accessories WHERE category_id = (SELECT id FROM accessory_categories WHERE name = "机箱")', (err, results) => {
                                if (err) reject(err);
                                else resolve(results);
                            });
                        }),
                        new Promise((resolve, reject) => {
                            db.query('SELECT * FROM accessories WHERE category_id = (SELECT id FROM accessory_categories WHERE name = "电源")', (err, results) => {
                                if (err) reject(err);
                                else resolve(results);
                            });
                        }),
                        new Promise((resolve, reject) => {
                            db.query('SELECT * FROM accessories WHERE category_id = (SELECT id FROM accessory_categories WHERE name = "显示器")', (err, results) => {
                                if (err) reject(err);
                                else resolve(results);
                            });
                        })
                    ]).then(([cpuList, coolerList, motherboardList, memoryList, storageList, graphicsList, caseList, powerList, monitorList]) => {
                        res.render('products/edit', { 
                            product: product,
                            categories: categories,
                            categoryMap: categoryMap,
                            productAccessories: productAccessories,
                            cpuList: cpuList,
                            coolerList: coolerList,
                            motherboardList: motherboardList,
                            memoryList: memoryList,
                            storageList: storageList,
                            graphicsList: graphicsList,
                            caseList: caseList,
                            powerList: powerList,
                            monitorList: monitorList,
                            user: req.session.user,
                            active: 'products',
                            pageTitle: '编辑产品'
                        });
                    }).catch(err => {
                        console.error(err);
                        return res.status(500).send('服务器错误');
                    });
                });
            } else {
                // 非电脑主机产品，只需返回基本数据
                res.render('products/edit', { 
                    product: product,
                    categories: categories,
                    categoryMap: categoryMap,
                    productAccessories: [],
                    cpuList: [],
                    coolerList: [],
                    motherboardList: [],
                    memoryList: [],
                    storageList: [],
                    graphicsList: [],
                    caseList: [],
                    powerList: [],
                    monitorList: [],
                    user: req.session.user,
                    active: 'products',
                    pageTitle: '编辑产品'
                });
            }
        });
    });
});

// 更新产品
app.post('/products/edit/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const { 
        category_id, 
        name, 
        brand, 
        model, 
        specifications, 
        purchase_price, 
        printer_type,
        cpu,
        cooler,
        motherboard,
        memory,
        storage,
        graphics,
        case: computerCase,
        power,
        monitor,
        total_price,
        calculated_daily_rent,
        calculated_monthly_rent
    } = req.body;
    
    // 查询类别名称以判断类型
    db.query('SELECT name FROM product_categories WHERE id = ?', [category_id], (err, categoryResult) => {
        if (err) {
            console.error(err);
            return res.status(500).send('查询类别失败');
        }
        
        const categoryName = categoryResult.length > 0 ? categoryResult[0].name : '';
        const isComputer = categoryName === '电脑主机';
        const isPrinter = categoryName === '打印机';
        
        // 准备产品数据
        const productData = {
            category_id: category_id,
            name: name,
            brand: brand || null,
            model: model || null,
            specifications: isComputer ? specifications : null,
            purchase_price: isPrinter ? purchase_price : total_price || 0,
            printer_type: isPrinter ? printer_type : null,
            is_custom_config: isComputer ? 1 : 0,
            total_price: isComputer ? total_price || 0 : purchase_price || 0,
            rental_price_per_day: calculated_daily_rent || 0,
            rental_price_per_month: calculated_monthly_rent || 0
        };
        
        db.query(
            'UPDATE products SET category_id = ?, name = ?, brand = ?, model = ?, specifications = ?, purchase_price = ?, printer_type = ?, is_custom_config = ?, total_price = ?, rental_price_per_day = ?, rental_price_per_month = ? WHERE id = ?',
            [
                productData.category_id,
                productData.name,
                productData.brand,
                productData.model,
                productData.specifications,
                productData.purchase_price,
                productData.printer_type,
                productData.is_custom_config,
                productData.total_price,
                productData.rental_price_per_day,
                productData.rental_price_per_month,
                id
            ],
            (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('更新产品失败');
                }
                
                // 如果是电脑主机，更新配件关联
                if (isComputer) {
                    // 先删除旧的配件关联
                    db.query('DELETE FROM product_accessories WHERE product_id = ?', [id], (err) => {
                        if (err) {
                            console.error('删除旧配件关联失败:', err);
                            return res.status(500).send('更新产品失败');
                        }
                        
                        // 添加新的配件关联
                        const accessoryIds = [
                            { id: cpu, name: 'CPU' },
                            { id: cooler, name: '散热器' },
                            { id: motherboard, name: '主板' },
                            { id: memory, name: '内存' },
                            { id: storage, name: '硬盘' },
                            { id: graphics, name: '显卡' },
                            { id: computerCase, name: '机箱' },
                            { id: power, name: '电源' },
                            { id: monitor, name: '显示器' }
                        ].filter(item => item.id && item.id !== '');
                        
                        if (accessoryIds.length > 0) {
                            let completed = 0;
                            
                            accessoryIds.forEach(accessory => {
                                db.query(
                                    'INSERT INTO product_accessories (product_id, accessory_id) VALUES (?, ?)',
                                    [id, accessory.id],
                                    (err) => {
                                        if (err) {
                                            console.error(`保存配件关联失败 (${accessory.name}):`, err);
                                        }
                                        
                                        completed++;
                                        if (completed === accessoryIds.length) {
                                            res.redirect('/products');
                                        }
                                    }
                                );
                            });
                        } else {
                            res.redirect('/products');
                        }
                    });
                } else {
                    res.redirect('/products');
                }
            }
        );
    });
});

// 删除产品
app.delete('/products/delete/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    
    // 由于设置了外键约束 ON DELETE CASCADE，删除产品时会自动删除关联的配件
    db.query('DELETE FROM products WHERE id = ?', [id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true });
    });
});

// 设备管理（旧版，已改为 /devices-old，仅保留用于参考）
app.get('/devices-old', isAuthenticated, (req, res) => {
    db.query('SELECT d.*, p.name as product_name, p.model_number as product_specifications, s.name as supplier_name FROM devices d LEFT JOIN products p ON d.product_id = p.id LEFT JOIN suppliers s ON d.supplier_id = s.id ORDER BY d.created_at DESC', (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 获取所有产品型号（用于筛选）
        db.query(`
            SELECT DISTINCT d.product_id, p.product_code, p.specifications, COUNT(*) as count
            FROM devices d
            LEFT JOIN products p ON d.product_id = p.id
            WHERE d.product_id IS NOT NULL
            GROUP BY d.product_id, p.product_code, p.specifications
            ORDER BY p.product_code
        `, (err2, productCodes) => {
            if (err2) {
                console.error(err2);
                return res.status(500).send('服务器错误');
            }
            
            res.render('devices/index', { 
                devices: results,
                productCodes: productCodes,
                user: req.session.user,
                moment: moment,
                active: 'devices',
                pageTitle: '设备管理'
            });
        });
    });
});

// 组装设备 - 减少配件库存
app.post('/devices/assemble', isAuthenticated, (req, res, next) => {
    const { device_id, product_id } = req.body;

    if (!device_id && !product_id) {
        return next();
    }

    if (!device_id || !product_id) {
        return res.json({ success: false, message: '参数不完整' });
    }

    // 检查是否是电脑主机产品（使用 products.is_host 标记）
    db.query('SELECT is_host FROM products WHERE id = ?', [product_id], (err, productResult) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: '查询产品失败' });
        }
        
        if (productResult.length === 0) {
            return res.json({ success: false, message: '产品不存在' });
        }
        
        const product = productResult[0];
        
        // 如果未标记为电脑主机，直接返回成功（不做配件扣减）
        if (!product.is_host) {
            return res.json({ success: true, message: '设备组装完成（非电脑主机，无需扣减配件）' });
        }
        
        // 查询产品关联的配件
        db.query(`
            SELECT pa.accessory_id, a.name, a.stock_quantity, a.current_price
            FROM product_accessories pa
            JOIN accessories a ON pa.accessory_id = a.id
            WHERE pa.product_id = ?
        `, [product_id], (err, accessoriesResult) => {
            if (err) {
                console.error(err);
                return res.json({ success: false, message: '查询配件失败' });
            }
            
            if (accessoriesResult.length === 0) {
                return res.json({ success: true, message: '设备组装完成（无配件）' });
            }
            
            // 开始事务
            db.beginTransaction(err => {
                if (err) {
                    console.error(err);
                    return res.json({ success: false, message: '事务启动失败' });
                }
                
                let completedCount = 0;
                const hasInsufficientStock = [];
                
                // 检查每个配件的库存
                accessoriesResult.forEach(accessory => {
                    if ((accessory.stock_quantity || 0) < 1) {
                        hasInsufficientStock.push(accessory.name);
                    }
                    
                    completedCount++;
                    if (completedCount === accessoriesResult.length) {
                        // 如果有配件库存不足，返回错误
                        if (hasInsufficientStock.length > 0) {
                            return db.rollback(() => {
                                res.json({ 
                                    success: false, 
                                    message: '以下配件库存不足：' + hasInsufficientStock.join(', ') 
                                });
                            });
                        }
                        
                        // 所有配件库存足够，开始扣减
                        completedCount = 0;
                        accessoriesResult.forEach(accessory => {
                            const newStock = accessory.stock_quantity - 1;
                            
                            // 更新配件库存
                            db.query('UPDATE accessories SET stock_quantity = ?, status = ? WHERE id = ?', 
                                [newStock, 'assembled', accessory.accessory_id], (err) => {
                                if (err) {
                                    console.error('更新配件库存失败:', err);
                                }
                                
                                // 插入库存记录
                                db.query(`
                                    INSERT INTO accessory_inventory_records 
                                    (accessory_id, record_type, quantity, unit_price, total_value, reference_type, reference_id, created_by) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                `, [
                                    accessory.accessory_id, 
                                    'out', 
                                    -1, 
                                    accessory.current_price || 0, 
                                    -(accessory.current_price || 0), 
                                    'assembly', 
                                    device_id, 
                                    req.session.user.id
                                ], (err) => {
                                    if (err) {
                                        console.error('插入库存记录失败:', err);
                                    }
                                    
                                    completedCount++;
                                    if (completedCount === accessoriesResult.length) {
                                        // 提交事务
                                        db.commit(err => {
                                            if (err) {
                                                return db.rollback(() => {
                                                    console.error(err);
                                                    res.json({ success: false, message: '事务提交失败' });
                                                });
                                            }
                                            
                                            res.json({ success: true, message: '设备组装完成，配件库存已更新' });
                                        });
                                    }
                                });
                            });
                        });
                    }
                });
            });
        });
    });
});

// 返还设备 - 增加配件库存
app.post('/devices/return', isAuthenticated, (req, res) => {
    const { device_id } = req.body;
    
    if (!device_id) {
        return res.json({ success: false, message: '参数不完整' });
    }
    
    // 查询设备信息
    db.query(`
        SELECT d.*, p.is_host, p.name as product_name
        FROM devices d
        JOIN products p ON d.product_id = p.id
        WHERE d.id = ?
    `, [device_id], (err, deviceResult) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: '查询设备失败' });
        }
        
        if (deviceResult.length === 0) {
            return res.json({ success: false, message: '设备不存在' });
        }
        
        const device = deviceResult[0];
        
        // 如果未标记为电脑主机，直接返回成功（不做配件返还）
        if (!device.is_host) {
            return res.json({ success: true, message: '设备返还完成（非电脑主机，无需返还配件）' });
        }
        
        // 查询产品关联的配件
        db.query(`
            SELECT pa.accessory_id, a.name, a.stock_quantity, a.current_price
            FROM product_accessories pa
            JOIN accessories a ON pa.accessory_id = a.id
            WHERE pa.product_id = ?
        `, [device.product_id], (err, accessoriesResult) => {
            if (err) {
                console.error(err);
                return res.json({ success: false, message: '查询配件失败' });
            }
            
            if (accessoriesResult.length === 0) {
                return res.json({ success: true, message: '设备返还完成（无配件）' });
            }
            
            // 开始事务
            db.beginTransaction(err => {
                if (err) {
                    console.error(err);
                    return res.json({ success: false, message: '事务启动失败' });
                }
                
                let completedCount = 0;
                
                // 增加每个配件的库存
                accessoriesResult.forEach(accessory => {
                    const newStock = (accessory.stock_quantity || 0) + 1;
                    
                    // 更新配件库存和状态
                    db.query('UPDATE accessories SET stock_quantity = ?, status = ? WHERE id = ?', 
                        [newStock, 'in_warehouse', accessory.accessory_id], (err) => {
                            if (err) {
                                console.error('更新配件库存失败:', err);
                            }
                            
                            // 插入库存记录
                            db.query(`
                                INSERT INTO accessory_inventory_records 
                                (accessory_id, record_type, quantity, unit_price, total_value, reference_type, reference_id, created_by) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `, [
                                accessory.accessory_id, 
                                'in', 
                                1, 
                                accessory.current_price || 0, 
                                accessory.current_price || 0, 
                                'return', 
                                device_id, 
                                req.session.user.id
                            ], (err) => {
                                if (err) {
                                    console.error('插入库存记录失败:', err);
                                }
                                
                                completedCount++;
                                if (completedCount === accessoriesResult.length) {
                                    // 提交事务
                                    db.commit(err => {
                                        if (err) {
                                            return db.rollback(() => {
                                                console.error(err);
                                                res.json({ success: false, message: '事务提交失败' });
                                            });
                                        }
                                        
                                        res.json({ success: true, message: '设备返还完成，配件库存已更新' });
                                    });
                                }
                            });
                        });
                });
            });
        });
    });
});

// 配件管理
app.get('/accessories', isAuthenticated, (req, res) => {
    // 获取查询参数
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const status = req.query.status || '';
    const sortBy = req.query.sort || 'name';
    const sortOrder = req.query.order || 'asc';
    
    // 初始化默认值
    const defaultValues = {
        accessories: [],
        categories: [],
        currentPage: 1,
        totalPages: 1,
        totalStats: {
            totalQuantity: 0,
            originalValue: 0,
            currentValue: 0,
            depreciationRate: 0
        }
    };
    
    // 构建查询条件
    let whereConditions = [];
    let queryParams = [];
    
    if (search) {
        whereConditions.push('(a.name LIKE ? OR a.brand LIKE ? OR a.model LIKE ?)');
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (category) {
        whereConditions.push('a.category_id = ?');
        queryParams.push(category);
    }
    
    if (status) {
        whereConditions.push('a.status = ?');
        queryParams.push(status);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // 构建排序条件
    const orderClause = `ORDER BY a.${sortBy} ${sortOrder.toUpperCase()}`;
    
    // 查询配件列表（每个配件只显示一条，附带采购/使用/报废统计）
    const query = `
        SELECT 
            a.*, 
            ac.name AS category_name, 
            s.name AS supplier_name,
            COALESCE(latest_price.price, a.purchase_price) AS current_price,
            COALESCE(batch_stats.purchase_total_quantity, 0) AS purchase_total_quantity,
            COALESCE(batch_stats.in_use_quantity, 0) AS in_use_quantity,
            COALESCE(batch_stats.scrap_quantity, 0) AS scrap_quantity
        FROM accessories a 
        LEFT JOIN accessory_categories ac ON a.category_id = ac.id 
        LEFT JOIN suppliers s ON a.supplier_id = s.id
        LEFT JOIN (
            SELECT aph1.*
            FROM accessory_price_history aph1
            JOIN (
                    SELECT accessory_id, MAX(month_year) AS max_month_year 
                    FROM accessory_price_history 
                    GROUP BY accessory_id
            ) latest ON aph1.accessory_id = latest.accessory_id
                     AND aph1.month_year = latest.max_month_year
        ) latest_price ON a.id = latest_price.accessory_id
        LEFT JOIN (
            SELECT 
                accessory_id,
                SUM(quantity) AS purchase_total_quantity,
                SUM(used_quantity) AS in_use_quantity,
                SUM(scrapped_quantity) AS scrap_quantity
            FROM accessory_batch_stock
            GROUP BY accessory_id
        ) batch_stats ON a.id = batch_stats.accessory_id
        ${whereClause} 
        ${orderClause} 
        LIMIT ? OFFSET ?`;
    
    queryParams.push(limit, offset);
    
    db.query(query, queryParams, (err, accessories) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 获取总数（只统计配件数量，与价格历史无关）
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM accessories a 
            LEFT JOIN accessory_categories ac ON a.category_id = ac.id 
            LEFT JOIN suppliers s ON a.supplier_id = s.id
            ${whereClause}`;
        
        const countParams = queryParams.slice(0, -2); // 移除limit和offset参数
        
        db.query(countQuery, countParams, (err, countResult) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            const totalItems = countResult[0].total;
            const totalPages = Math.ceil(totalItems / limit);
            
            // 获取配件类别
            db.query('SELECT * FROM accessory_categories ORDER BY name', (err, categories) => {
                if (err) {
                    console.error(err);
                    // 即使查询失败，也返回空数组而不是抛出错误
                    categories = [];
                }
                
                // 计算统计数据
                const statsQuery = `
                    SELECT 
                        COUNT(*) as totalTypes,
                        SUM(a.stock_quantity) as totalQuantity,
                        SUM(CASE WHEN a.stock_quantity <= a.min_stock_level THEN 1 ELSE 0 END) as lowStockCount,
                        (SELECT COUNT(*) FROM accessory_categories) as categoryCount
                    FROM accessories a`;
                
                db.query(statsQuery, (err, statsResult) => {
                    if (err) {
                        console.error(err);
                        // 即使查询失败，也提供默认统计数据
                        statsResult = [{
                            totalQuantity: 0,
                            originalValue: 0,
                            currentValue: 0
                        }];
                    }
                    
                    const stats = statsResult[0];
                    const totalStats = {
                        totalTypes: parseInt(stats.totalTypes) || 0,
                        totalQuantity: parseInt(stats.totalQuantity) || 0,
                        lowStockCount: parseInt(stats.lowStockCount) || 0,
                        categoryCount: parseInt(stats.categoryCount) || 0
                    };
                    
                    res.render('accessories/index', { 
                        accessories: accessories || defaultValues.accessories,
                        categories: categories || defaultValues.categories,
                        currentPage: page || defaultValues.currentPage,
                        totalPages: totalPages || defaultValues.totalPages,
                        totalStats: totalStats || defaultValues.totalStats,
                        // 将当前筛选条件传递给前端，便于下拉框显示选中状态
                        selectedCategoryId: category,
                        selectedStatus: status,
                        selectedSortBy: sortBy,
                        selectedSortOrder: sortOrder,
                        searchKeyword: search,
                        user: req.session.user,
                        moment: moment,
                        active: 'accessories',
                        pageTitle: '配件管理'
                    });
                });
            });
        });
    });
});

// 添加配件页面
app.get('/accessories/add', isAuthenticated, (req, res) => {
    // 获取配件类别和供应商列表
    db.query('SELECT * FROM accessory_categories ORDER BY name', (err, categories) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        db.query('SELECT * FROM suppliers ORDER BY name', (err, suppliers) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            res.render('accessories/add', { 
                categories: categories,
                suppliers: suppliers,
                user: req.session.user,
                active: 'accessories',
                pageTitle: '添加配件'
            });
        });
    });
});

// 添加配件
app.post('/accessories/add', isAuthenticated, (req, res) => {
    const { 
        name, 
        category_id, 
        brand, 
        model, 
        unit_price, 
        min_stock_level, 
        notes 
    } = req.body;
    
    // 验证必填字段
    if (!name || !category_id || !brand) {
        return res.status(400).json({ success: false, message: '请填写必填字段' });
    }
    
    // 插入配件记录（仅基本信息，不包含库存和采购信息）
    db.query(
        'INSERT INTO accessories (name, category_id, brand, model, unit_price, min_stock_level, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, category_id, brand, model, unit_price || 0, min_stock_level || 5, notes || ''],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: '添加配件失败' });
            }
            
            res.json({ 
                success: true, 
                message: '配件添加成功',
                accessoryId: result.insertId
            });
        }
    );
});

// 编辑配件页面

// 编辑配件页面
app.get('/accessories/edit/:id', isAuthenticated, (req, res) => {
    const accessoryId = req.params.id;

    db.query('SELECT * FROM accessories WHERE id = ?', [accessoryId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }

        if (results.length === 0) {
            return res.status(404).send('配件不存在');
        }

        const accessory = results[0];

        db.query('SELECT * FROM accessory_categories ORDER BY name', (err, categories) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }

            db.query('SELECT * FROM suppliers ORDER BY name', (err, suppliers) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器错误');
                }

                res.render('accessories/edit', {
                    accessory,
                    categories,
                    suppliers,
                    user: req.session.user,
                    active: 'accessories',
                    pageTitle: '编辑配件'
                });
            });
        });
    });
});

// 保存配件编辑
app.post('/accessories/edit/:id', isAuthenticated, (req, res) => {
    const accessoryId = req.params.id;
    const {
        name,
        category_id,
        brand,
        model,
        unit_price,
        min_stock_level,
        description
    } = req.body;

    // 验证必填字段
    if (!name || !category_id || !brand) {
        return res.status(400).json({ success: false, message: '请填写必填字段' });
    }

    db.query(`
        UPDATE accessories
        SET name = ?,
            category_id = ?,
            brand = ?,
            model = ?,
            description = ?,
            unit_price = ?,
            min_stock_level = ?
        WHERE id = ?
    `, [
        name,
        category_id,
        brand,
        model || null,
        description || null,
        unit_price || 0,
        min_stock_level || 5,
        accessoryId
    ], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '保存配件失败' });
        }

        req.session.successMessage = '配件更新成功';
        res.redirect('/accessories');
    });
});

// 配件批次管理页面
app.get('/accessories/batches/:id', isAuthenticated, (req, res) => {
    const accessoryId = req.params.id;

    db.query(`
        SELECT a.*, ac.name AS category_name
        FROM accessories a
        LEFT JOIN accessory_categories ac ON a.category_id = ac.id
        WHERE a.id = ?
    `, [accessoryId], (err, accessoryResult) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }

        if (accessoryResult.length === 0) {
            return res.status(404).send('配件不存在');
        }

        const accessory = accessoryResult[0];

        // 优先使用新的批次库存表 accessory_batch_stock 计算每个采购批次的采购数量和剩余数量
        const batchFromStockSql = `
            SELECT 
                pb.batch_no AS batch_number,
                pb.purchase_date,
                abs.purchase_price,
                SUM(abs.quantity) AS quantity,
                SUM(abs.available_quantity) AS remaining_quantity,
                s.name AS supplier_name,
                pb.notes,
                abs.status AS batch_status,
                GROUP_CONCAT(DISTINCT abs.status) AS all_statuses,
                COALESCE(SUM(scrap.scrapped_quantity), 0) AS scrapped_quantity
            FROM accessory_batch_stock abs
            LEFT JOIN purchase_batches pb ON abs.batch_id = pb.id
            LEFT JOIN suppliers s ON pb.supplier_id = s.id
            LEFT JOIN (
                SELECT batch_stock_id, SUM(quantity) AS scrapped_quantity
                FROM accessory_scrap_records
                GROUP BY batch_stock_id
            ) scrap ON abs.id = scrap.batch_stock_id
            WHERE abs.accessory_id = ?
            GROUP BY pb.id, pb.batch_no, pb.purchase_date, abs.purchase_price, s.name, pb.notes, abs.status
            ORDER BY pb.purchase_date DESC, pb.id DESC, abs.purchase_price
        `;

        db.query(batchFromStockSql, [accessoryId], (stockErr, stockBatches) => {
            if (stockErr) {
                console.error(stockErr);
                return res.status(500).send('服务器错误');
            }

            // 如果新批次表有数据，则以此为准；否则回退到旧表 accessory_batches
            const renderWithBatches = (batches) => {
                res.render('accessories/batches', {
                    accessory,
                    batches,
                    user: req.session.user,
                    moment: moment,
                    active: 'accessories',
                    pageTitle: '配件批次管理'
                });
            };

            if (Array.isArray(stockBatches) && stockBatches.length > 0) {
                return renderWithBatches(stockBatches);
            }

            db.query(`
                SELECT ab.batch_number,
                       ab.purchase_date,
                       ab.purchase_price,
                       ab.quantity,
                       ab.remaining_quantity,
                       s.name AS supplier_name,
                       ab.notes
                FROM accessory_batches ab
                LEFT JOIN suppliers s ON ab.supplier_id = s.id
                WHERE ab.accessory_id = ?
                ORDER BY ab.purchase_date DESC, ab.created_at DESC
            `, [accessoryId], (legacyErr, legacyBatches) => {
                if (legacyErr) {
                    console.error(legacyErr);
                    return res.status(500).send('服务器错误');
                }

                renderWithBatches(legacyBatches || []);
            });
        });
    });
});

// 删除配件
app.get('/accessories/delete/:id', isAuthenticated, (req, res) => {
    const accessoryId = req.params.id;

    // 先检查是否存在
    db.query('SELECT name FROM accessories WHERE id = ?', [accessoryId], (err, accessoryResult) => {
        if (err) {
            console.error(err);
            req.session.errorMessage = '删除配件失败：服务器错误';
            return res.redirect('/accessories');
        }

        if (accessoryResult.length === 0) {
            req.session.errorMessage = '配件不存在或已被删除';
            return res.redirect('/accessories');
        }

        // 检查是否已在设备组装记录中使用
        db.query('SELECT COUNT(*) AS count FROM device_assemblies WHERE accessory_id = ?', [accessoryId], (err, usedResult) => {
            let usedCount = 0;

            if (err) {
                if (err.code === 'ER_NO_SUCH_TABLE') {
                    console.warn('device_assemblies 表不存在，跳过装配记录检查，直接按未使用处理');
                } else {
                    console.error(err);
                    req.session.errorMessage = '删除配件失败：服务器错误';
                    return res.redirect('/accessories');
                }
            } else if (usedResult && usedResult[0]) {
                usedCount = usedResult[0].count;
            }

            if (usedCount > 0) {
                req.session.errorMessage = '该配件已在设备组装记录中使用，无法直接删除，请先处理相关设备或改为报废';
                return res.redirect('/accessories');
            }

            // 执行删除，相关批次、价格历史、库存记录通过外键级联删除
            db.query('DELETE FROM accessories WHERE id = ?', [accessoryId], (err, result) => {
                if (err) {
                    console.error(err);
                    req.session.errorMessage = '删除配件失败：数据库错误';
                    return res.redirect('/accessories');
                }

                if (result.affectedRows === 0) {
                    req.session.errorMessage = '配件不存在或已被删除';
                } else {
                    req.session.successMessage = '配件已成功删除';
                }

                res.redirect('/accessories');
            });
        });
    });
});

// 生成批次号的辅助函数
function generateBatchNumber(supplierId, purchaseDate) {
    const date = new Date(purchaseDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    return `${year}${month}${day}-${random}`;
}

// 配件价格历史页面
app.get('/accessories/price-history', isAuthenticated, (req, res) => {
    const currentMonth = req.query.month || new Date().toISOString().slice(0, 7);
    const categoryId = req.query.category || '';
    
    // 获取配件类别
    db.query('SELECT * FROM accessory_categories ORDER BY name', (err, categories) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 构建查询条件
        let categoryFilter = categoryId ? 'AND a.category_id = ?' : '';
        
        // 计算上个月的日期
        const [year, month] = currentMonth.split('-').map(Number);
        let lastMonthYear, lastMonth;
        
        if (month === 1) {
            lastMonthYear = year - 1;
            lastMonth = 12;
        } else {
            lastMonthYear = year;
            lastMonth = month - 1;
        }
        
        const lastMonthStr = `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}`;
        
        let queryParams = [currentMonth, lastMonthStr];
        
        if (categoryId) {
            queryParams.push(categoryId);
        }
        
        // 查询配件价格历史
        const query = `
            SELECT 
                a.id,
                a.name,
                a.brand,
                a.model,
                ac.name as category_name,
                aph1.price as current_month_price,
                aph1.created_at as current_month_updated,
                aph2.price as last_month_price,
                CASE 
                    WHEN aph1.price IS NOT NULL AND aph2.price IS NOT NULL 
                    THEN ROUND((aph1.price - aph2.price) / aph2.price * 100, 2)
                    ELSE NULL 
                END as change_rate,
                CASE 
                    WHEN aph1.price IS NOT NULL THEN 1
                    ELSE 0
                END as updated_this_month
            FROM accessories a
            LEFT JOIN accessory_categories ac ON a.category_id = ac.id
            LEFT JOIN accessory_price_history aph1 ON a.id = aph1.accessory_id AND aph1.month_year = ?
            LEFT JOIN accessory_price_history aph2 ON a.id = aph2.accessory_id AND aph2.month_year = ?
            WHERE a.status != 'scrapped' ${categoryFilter}
            ORDER BY ac.name, a.name
        `;
        
        db.query(query, queryParams, (err, priceHistory) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            res.render('accessories/price-history', { 
                priceHistory: priceHistory,
                categories: categories,
                currentMonth: currentMonth,
                user: req.session.user,
                active: 'accessories',
                pageTitle: '配件价格管理'
            });
        });
    });
});

// 导出所有配件历史价格（CSV）
app.get('/accessories/price-history/export', isAuthenticated, (req, res) => {
    const sql = `
        SELECT 
            a.name AS accessory_name,
            a.brand,
            a.model,
            aph.month_year,
            aph.price
        FROM accessory_price_history aph
        JOIN accessories a ON aph.accessory_id = a.id
        ORDER BY a.name, aph.month_year
    `;

    db.query(sql, (err, rows) => {
        if (err) {
            console.error('导出配件历史价格失败:', err);
            return res.status(500).send('导出失败');
        }

        const header = ['配件名称', '品牌', '型号', '月份', '价格'];
        const csvRows = [header.join(',')];

        rows.forEach(row => {
            const fields = [
                row.accessory_name || '',
                row.brand || '',
                row.model || '',
                row.month_year || '',
                row.price != null ? Number(row.price).toFixed(2) : ''
            ];

            const escaped = fields.map(value => {
                const str = String(value == null ? '' : value).replace(/"/g, '""');
                return '"' + str + '"';
            });

            csvRows.push(escaped.join(','));
        });

        const csvContent = csvRows.join('\r\n');
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const filename = `accessory_price_history_${yyyy}${mm}${dd}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`);
        res.send('\uFEFF' + csvContent);
    });
});



// 更新配件价格
app.post('/accessories/update-price', isAuthenticated, (req, res) => {
    const { accessory_id, price, month } = req.body;
    
    if (!accessory_id || !price || !month) {
        return res.json({ success: false, message: '参数不完整' });
    }
    
    // 更新或插入价格记录（按配件 + 月份唯一）
    db.query(
        'INSERT INTO accessory_price_history (accessory_id, price, month_year) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE price = ?',
        [accessory_id, price, month, price],
        (err) => {
            if (err) {
                console.error(err);
                return res.json({ success: false, message: '更新价格失败' });
            }
            
            res.json({ success: true, message: '价格更新成功' });
        }
    );
});

// 获取配件的批量价格历史数据
app.get('/accessories/batch-price-history', isAuthenticated, (req, res) => {
    const { accessory_id } = req.query;
    
    console.log('收到批量价格历史请求，accessory_id:', accessory_id);
    
    if (!accessory_id) {
        console.log('缺少配件ID');
        return res.json({ success: false, message: '缺少配件ID' });
    }
    
    // 查询该配件所有历史价格（从2018年至今）
    const query = `
        SELECT month_year, price 
        FROM accessory_price_history 
        WHERE accessory_id = ? 
        AND month_year >= '2018-01'
        ORDER BY month_year ASC
    `;
    
    console.log('执行查询，配件ID:', accessory_id);
    
    db.query(query, [accessory_id], (err, results) => {
        if (err) {
            console.error('查询价格历史失败:', err);
            return res.json({ success: false, message: '查询失败: ' + err.message });
        }
        
        console.log('查询成功，找到', results.length, '条记录');
        
        // 转换为 { 'YYYY-MM': price } 格式
        const priceData = {};
        results.forEach(row => {
            priceData[row.month_year] = parseFloat(row.price);
        });
        
        console.log('返回价格数据:', priceData);
        
        res.json({ success: true, data: priceData });
    });
});

// 批量更新配件价格
app.post('/accessories/batch-update-prices', isAuthenticated, (req, res) => {
    const { accessory_id, prices } = req.body;
    
    if (!accessory_id || !prices || !Array.isArray(prices)) {
        return res.json({ success: false, message: '参数不完整' });
    }
    
    if (prices.length === 0) {
        return res.json({ success: false, message: '没有需要更新的价格' });
    }
    
    // 开始事务
    db.beginTransaction(err => {
        if (err) {
            console.error('开始事务失败:', err);
            return res.json({ success: false, message: '服务器错误' });
        }
        
        let completedCount = 0;
        let hasError = false;
        
        // 批量插入或更新价格
        prices.forEach((priceItem, index) => {
            const { month, price } = priceItem;
            
            db.query(
                'INSERT INTO accessory_price_history (accessory_id, price, month_year) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE price = ?',
                [accessory_id, price, month, price],
                (err) => {
                    if (err && !hasError) {
                        hasError = true;
                        return db.rollback(() => {
                            console.error('批量更新价格失败:', err);
                            res.json({ success: false, message: '批量更新失败' });
                        });
                    }
                    
                    completedCount++;
                    
                    // 所有操作完成
                    if (completedCount === prices.length && !hasError) {
                        db.commit(err => {
                            if (err) {
                                return db.rollback(() => {
                                    console.error('提交事务失败:', err);
                                    res.json({ success: false, message: '提交失败' });
                                });
                            }
                            
                            res.json({ 
                                success: true, 
                                message: '批量更新成功',
                                updated_count: prices.length
                            });
                        });
                    }
                }
            );
        });
    });
});

// 配件统计页面
app.get('/accessories/stats', isAuthenticated, (req, res) => {
    const period = req.query.period || 'month';
    const categoryId = req.query.category || '';
    const modelKeyword = (req.query.model || '').trim().toLowerCase();
    const startDate = req.query.startDate || moment().subtract(11, 'months').format('YYYY-MM-DD');
    const endDate = req.query.endDate || moment().format('YYYY-MM-DD');
    
    // 获取配件类别
    db.query('SELECT * FROM accessory_categories ORDER BY name', (err, categories) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 查询全部配件详情及价格（不在 SQL 中按类别过滤，后续在 Node 层按 categoryId 过滤）
        // 原始采购金额不再使用 accessories.purchase_price × stock_quantity，
        // 而是改为"所有批次采购配件价格总和"（accessory_batch_stock 中所有批次的 purchase_price × quantity）。
        const query = `
            SELECT 
                a.id,
                a.name,
                a.brand,
                a.model,
                a.category_id,
                a.stock_quantity,
                ac.name AS category_name,
                -- 按最新价格计算当前单价
                COALESCE(latest_price.price, a.purchase_price) AS current_price,
                COALESCE(latest_price.price, a.purchase_price) * a.stock_quantity AS current_value,
                -- 汇总该配件所有批次的采购金额
                COALESCE(batch_stats.total_purchase_amount, 0) AS original_value,
                COALESCE(batch_stats.avg_purchase_price, a.purchase_price) AS original_price
            FROM accessories a
            LEFT JOIN accessory_categories ac ON a.category_id = ac.id
            LEFT JOIN (
                SELECT aph1.*
                FROM accessory_price_history aph1
                JOIN (
                    SELECT accessory_id, MAX(month_year) AS max_month_year 
                    FROM accessory_price_history 
                    GROUP BY accessory_id
                ) latest ON aph1.accessory_id = latest.accessory_id 
                         AND aph1.month_year = latest.max_month_year
            ) latest_price ON a.id = latest_price.accessory_id
            LEFT JOIN (
                SELECT 
                    abs.accessory_id,
                    -- 按"库存数量 × 采购单价"汇总库存采购金额
                    SUM(abs.available_quantity * abs.purchase_price) AS total_purchase_amount,
                    CASE WHEN SUM(abs.available_quantity) > 0 
                         THEN SUM(abs.available_quantity * abs.purchase_price) / SUM(abs.available_quantity)
                         ELSE NULL END AS avg_purchase_price
                FROM accessory_batch_stock abs
                GROUP BY abs.accessory_id
            ) batch_stats ON a.id = batch_stats.accessory_id
            WHERE a.status != 'scrapped'
            ORDER BY ac.name, a.name
        `;
        
        db.query(query, [], (err, accessories) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            // 在 Node 层按类别进行过滤（如果选择了类别）
            let filteredAccessories = accessories;
            if (categoryId) {
                filteredAccessories = accessories.filter(acc => String(acc.category_id) === String(categoryId));
            }

            // 按型号关键字进行模糊过滤（如果填写了型号搜索）
            if (modelKeyword) {
                filteredAccessories = filteredAccessories.filter(acc => {
                    const model = (acc.model || '').toLowerCase();
                    const name = (acc.name || '').toLowerCase();
                    return model.includes(modelKeyword) || name.includes(modelKeyword);
                });
            }
            
            // 计算贬值率和贬值金额（基于每个配件所有批次的采购总额）
            filteredAccessories.forEach(accessory => {
                const originalValue = accessory.original_value || 0;
                const currentValue = accessory.current_value || 0;
                
                accessory.depreciation_rate = originalValue > 0 ? ((originalValue - currentValue) / originalValue * 100) : 0;
                accessory.depreciation_value = originalValue - currentValue;
            });
            
            // 计算总体统计（基于过滤后的配件）
            const totalQuantity = filteredAccessories.reduce((sum, acc) => sum + (acc.stock_quantity || 0), 0);
            const originalValue = filteredAccessories.reduce((sum, acc) => sum + (acc.original_value || 0), 0);
            const currentValue = filteredAccessories.reduce((sum, acc) => sum + (acc.current_value || 0), 0);
            const depreciationValue = originalValue - currentValue;
            const depreciationRate = originalValue > 0 ? (depreciationValue / originalValue * 100) : 0;
            
            const stats = {
                totalQuantity,
                originalValue,
                currentValue,
                depreciationRate,
                depreciationValue
            };
            
            // 获取趋势数据（简化版）
            const trendData = generateTrendData(period, startDate, endDate);
            
            // 获取类别分布数据（基于过滤后的配件）
            const categoryData = generateCategoryData(filteredAccessories);

            // 额外查询：按批次维度的采购明细（用于"配件库存明细"表）
            let batchQuery = `
                SELECT 
                    a.id AS accessory_id,
                    a.name,
                    a.brand,
                    a.category_id,
                    ac.name AS category_name,
                    pb.batch_no,
                    abs.purchase_price,
                    SUM(abs.quantity) AS purchase_quantity,
                    SUM(abs.available_quantity) AS available_quantity,
                    SUM(abs.quantity - abs.available_quantity) AS out_quantity,
                    COALESCE(latest_price.price, a.purchase_price) AS current_price
                FROM accessory_batch_stock abs
                JOIN accessories a ON abs.accessory_id = a.id
                LEFT JOIN accessory_categories ac ON a.category_id = ac.id
                LEFT JOIN purchase_batches pb ON abs.batch_id = pb.id
                LEFT JOIN (
                    SELECT aph1.*
                    FROM accessory_price_history aph1
                    JOIN (
                        SELECT accessory_id, MAX(month_year) AS max_month_year 
                        FROM accessory_price_history 
                        GROUP BY accessory_id
                    ) latest ON aph1.accessory_id = latest.accessory_id 
                             AND aph1.month_year = latest.max_month_year
                ) latest_price ON a.id = latest_price.accessory_id
                WHERE a.status != 'scrapped'
            `;

            const batchParams = [];
            if (categoryId) {
                batchQuery += ' AND a.category_id = ?';
                batchParams.push(categoryId);
            }
            if (modelKeyword) {
                batchQuery += ' AND (a.model LIKE ? OR a.name LIKE ?)';
                const like = `%${modelKeyword}%`;
                batchParams.push(like, like);
            }

            batchQuery += `
                GROUP BY 
                    a.id, a.name, a.brand, a.category_id, ac.name,
                    pb.batch_no, abs.purchase_price
                ORDER BY ac.name, a.name, pb.batch_no, abs.purchase_price
            `;

            db.query(batchQuery, batchParams, (batchErr, batchDetails) => {
                if (batchErr) {
                    console.error(batchErr);
                    return res.status(500).send('服务器错误');
                }

                res.render('accessories/stats', {
                    accessories: filteredAccessories,
                    batchDetails,
                    categories,
                    stats,
                    trendData,
                    categoryData,
                    startDate,
                    endDate,
                    selectedCategoryId: categoryId,
                    modelKeyword,
                    period,
                    user: req.session.user,
                    moment: moment,
                    active: 'accessories',
                    pageTitle: '配件库存统计'
                });
            });
        });
    });
});

// 生成趋势数据的辅助函数
function generateTrendData(period, startDate, endDate) {
    const start = moment(startDate);
    const end = moment(endDate);
    const labels = [];
    const originalValues = [];
    const currentValues = [];
    
    // 简化处理，返回示例数据
    for (let date = start.clone(); date.isSameOrBefore(end, 'month'); date.add(1, 'month')) {
        labels.push(date.format('YYYY-MM'));
        // 这里应该是实际查询数据库的值，这里使用模拟值
        originalValues.push(Math.floor(Math.random() * 50000) + 100000);
        currentValues.push(Math.floor(Math.random() * 45000) + 95000);
    }
    
    return { labels, originalValues, currentValues };
}

// 生成类别分布数据的辅助函数
function generateCategoryData(accessories) {
    // 按类别分组
    const categoryMap = {};
    accessories.forEach(accessory => {
        if (!categoryMap[accessory.category_name]) {
            categoryMap[accessory.category_name] = 0;
        }
        categoryMap[accessory.category_name] += accessory.current_value || 0;
    });
    
    return {
        labels: Object.keys(categoryMap),
        values: Object.values(categoryMap)
    };
}

// 配件详情页面
app.get('/accessories/view/:id', isAuthenticated, (req, res) => {
    const accessoryId = req.params.id;
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    // 获取配件详情（采购价格按"最近一批次采购单价"显示）
    db.query(`
        SELECT 
            a.*, 
            ac.name as category_name,
            COALESCE(aph.price, a.purchase_price) as current_price,
            (
                SELECT abs2.purchase_price
                FROM accessory_batch_stock abs2
                WHERE abs2.accessory_id = a.id
                ORDER BY abs2.created_at DESC, abs2.id DESC
                LIMIT 1
            ) AS last_batch_purchase_price
        FROM accessories a
        LEFT JOIN accessory_categories ac ON a.category_id = ac.id
        LEFT JOIN accessory_price_history aph ON a.id = aph.accessory_id 
        LEFT JOIN (
            SELECT accessory_id, MAX(month_year) as max_month_year 
            FROM accessory_price_history 
            GROUP BY accessory_id
        ) latest_price ON aph.accessory_id = latest_price.accessory_id AND aph.month_year = latest_price.max_month_year
        WHERE a.id = ?
    `, [accessoryId], (err, accessoryResult) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (accessoryResult.length === 0) {
            return res.status(404).send('配件不存在');
        }
        
        const accessory = accessoryResult[0];
        
        // 如果存在最近一批次的采购单价，则覆盖采购价格显示
        if (accessory.last_batch_purchase_price != null) {
            accessory.purchase_price = accessory.last_batch_purchase_price;
        }
        
        // 获取价格历史
        db.query(`
            SELECT month_year, price 
            FROM accessory_price_history
            WHERE accessory_id = ?
            ORDER BY month_year ASC
        `, [accessoryId], (err, priceHistoryResult) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            // 处理价格历史数据
            const labels = priceHistoryResult.map(item => item.month_year);
            const prices = priceHistoryResult.map(item => item.price);

            // 使用价格历史中最新一条作为当前价格（保障当前单价=日期最大那条价格）
            let currentPriceFromHistory = accessory.current_price || 0;
            if (priceHistoryResult.length > 0) {
                const lastItem = priceHistoryResult[priceHistoryResult.length - 1];
                if (lastItem && lastItem.price != null) {
                    currentPriceFromHistory = lastItem.price;
                }
            }
            accessory.current_price = currentPriceFromHistory;
            
            // 计算贬值率
            const originalPrice = accessory.purchase_price || 0;
            const currentPrice = currentPriceFromHistory || 0;
            const stockQuantity = accessory.stock_quantity || 0;
            
            const totalOriginalValue = originalPrice * stockQuantity;
            const totalCurrentValue = currentPrice * stockQuantity;
            const depreciationValue = totalOriginalValue - totalCurrentValue;
            
            // 获取此配件的折旧率设置
            db.query(`
                SELECT setting_value 
                FROM accessory_settings 
                WHERE setting_name = ?
            `, [`${accessory.category_name}_depreciation_rate`], (err, settingResult) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器错误');
                }
                
                let annualDepreciationRate;
                let monthlyDepreciationRate;

                if (priceHistoryResult.length >= 2) {
                    const firstPrice = priceHistoryResult[0].price || 0;
                    const lastPrice = priceHistoryResult[priceHistoryResult.length - 1].price || 0;

                    if (firstPrice > 0 && lastPrice >= 0) {
                        const startMonth = moment(priceHistoryResult[0].month_year, 'YYYY-MM');
                        const endMonth = moment(priceHistoryResult[priceHistoryResult.length - 1].month_year, 'YYYY-MM');
                        let monthsDiff = endMonth.diff(startMonth, 'months');
                        if (monthsDiff < 1) {
                            monthsDiff = 1;
                        }
                        const totalDepRatio = (firstPrice - lastPrice) / firstPrice; // 总贬值占比
                        const monthlyRate = monthsDiff > 0 ? totalDepRatio / monthsDiff : 0;
                        monthlyDepreciationRate = monthlyRate * 100;
                        annualDepreciationRate = monthlyDepreciationRate * 12;
                    } else {
                        annualDepreciationRate = settingResult.length > 0 ?
                            parseFloat(settingResult[0].setting_value) * 100 : 10; // 默认10%
                        monthlyDepreciationRate = annualDepreciationRate / 12;
                    }
                } else {
                    annualDepreciationRate = settingResult.length > 0 ?
                        parseFloat(settingResult[0].setting_value) * 100 : 10; // 默认10%
                    monthlyDepreciationRate = annualDepreciationRate / 12;
                }

                    // 获取库存记录
                    db.query(`
                    SELECT air.*, u.real_name as created_by_name
                    FROM accessory_inventory_records air
                    LEFT JOIN users u ON air.created_by = u.id
                    WHERE air.accessory_id = ?
                    ORDER BY air.created_at DESC
                    LIMIT 50
                `, [accessoryId], (err, inventoryRecords) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('服务器错误');
                    }

                    // 获取可用于报废的批次（仍有剩余数量的批次）
                    const scrapBatchesSql = `
                        SELECT 
                            pb.id AS batch_id,
                            pb.batch_no,
                            pb.purchase_date,
                            abs.purchase_price,
                            SUM(abs.available_quantity) AS remaining_quantity
                        FROM accessory_batch_stock abs
                        LEFT JOIN purchase_batches pb ON abs.batch_id = pb.id
                        WHERE abs.accessory_id = ?
                        GROUP BY pb.id, pb.batch_no, pb.purchase_date, abs.purchase_price
                        HAVING remaining_quantity > 0
                        ORDER BY pb.purchase_date DESC, pb.id DESC, abs.purchase_price
                    `;

                    db.query(scrapBatchesSql, [accessoryId], (scrapErr, scrapBatches) => {
                        if (scrapErr) {
                            console.error('查询可报废批次失败:', scrapErr);
                            return res.status(500).send('服务器错误');
                        }
                    
                        res.render('accessories/view', {
                            accessory,
                            priceHistory: { labels, prices },
                            inventoryRecords,
                            scrapBatches,
                            monthlyDepreciationRate,
                            annualDepreciationRate,
                            depreciationValue,
                            currentMonth,
                            user: req.session.user,
                            moment: moment,
                            active: 'accessories',
                            pageTitle: '配件详情'
                        });
                    });
                });
            });
        });
    });
});

// 调整库存
app.post('/accessories/adjust-stock', isAuthenticated, (req, res) => {
    const { accessory_id, type, quantity, reason } = req.body;
    
    if (!accessory_id || !type || !quantity || !reason) {
        return res.json({ success: false, message: '参数不完整' });
    }
    
    // 开始事务
    db.beginTransaction(err => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: '事务启动失败' });
        }
        
        // 获取当前库存和价格（使用采购价作为当前单价）
        db.query('SELECT stock_quantity, purchase_price AS current_price FROM accessories WHERE id = ?', [accessory_id], (err, result) => {
            if (err) {
                return db.rollback(() => {
                    console.error(err);
                    res.json({ success: false, message: '获取配件信息失败' });
                });
            }
            
            if (result.length === 0) {
                return db.rollback(() => {
                    res.json({ success: false, message: '配件不存在' });
                });
            }
            
            const { stock_quantity, current_price } = result[0];
            const adjustmentQuantity = type === 'increase' ? quantity : -quantity;
            const newStock = stock_quantity + adjustmentQuantity;
            
            if (newStock < 0) {
                return db.rollback(() => {
                    res.json({ success: false, message: '调整后库存不能为负数' });
                });
            }
            
            // 更新库存
            db.query('UPDATE accessories SET stock_quantity = ? WHERE id = ?', [newStock, accessory_id], (err) => {
                if (err) {
                    return db.rollback(() => {
                        console.error(err);
                        res.json({ success: false, message: '更新库存失败' });
                    });
                }
                
                // 插入库存记录
                db.query(`
                    INSERT INTO accessory_inventory_records 
                    (accessory_id, record_type, quantity, unit_price, total_value, reference_type, notes, created_by) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    accessory_id, 
                    'adjustment', 
                    adjustmentQuantity, 
                    current_price, 
                    adjustmentQuantity * current_price, 
                    'check', 
                    reason, 
                    req.session.user.id
                ], (err) => {
                    if (err) {
                        return db.rollback(() => {
                            console.error(err);
                            res.json({ success: false, message: '插入库存记录失败' });
                        });
                    }
                    
                    // 提交事务
                    db.commit(err => {
                        if (err) {
                            return db.rollback(() => {
                                console.error(err);
                                res.json({ success: false, message: '事务提交失败' });
                            });
                        }
                        
                        res.json({ success: true, message: '库存调整成功' });
                    });
                });
            });
        });
    });
});

// 报废配件（支持按批次部分报废）
app.post('/accessories/scrap', isAuthenticated, (req, res) => {
    const { accessory_id, reason, batch_id, quantity, scrap_date } = req.body;
    
    if (!accessory_id || !reason) {
        return res.json({ success: false, message: '参数不完整' });
    }

    const parsedBatchId = batch_id ? parseInt(batch_id, 10) : null;
    const parsedQuantity = quantity ? parseInt(quantity, 10) : null;
    const scrapDate = scrap_date || null;

    // 如果传入了批次和数量，走按批次部分报废逻辑
    if (parsedBatchId && parsedQuantity && parsedQuantity > 0) {
        db.beginTransaction(err => {
            if (err) {
                console.error(err);
                return res.json({ success: false, message: '事务启动失败' });
            }

            const stockSql = `
                SELECT 
                    id,
                    accessory_id,
                    batch_id,
                    quantity,
                    used_quantity,
                    scrapped_quantity,
                    purchase_price,
                    available_quantity
                FROM accessory_batch_stock
                WHERE accessory_id = ? 
                  AND batch_id = ? 
                  AND available_quantity > 0
                ORDER BY created_at ASC, id ASC
            `;

            db.query(stockSql, [accessory_id, parsedBatchId], (stockErr, rows) => {
                if (stockErr) {
                    return db.rollback(() => {
                        console.error('查询批次库存失败:', stockErr);
                        res.json({ success: false, message: '查询批次库存失败' });
                    });
                }

                if (!rows || rows.length === 0) {
                    return db.rollback(() => {
                        res.json({ success: false, message: '该批次没有可报废的库存' });
                    });
                }

                let totalAvailable = 0;
                rows.forEach((row) => {
                    totalAvailable += row.available_quantity || 0;
                });

                if (totalAvailable < parsedQuantity) {
                    return db.rollback(() => {
                        res.json({
                            success: false,
                            message: `该批次最多只能报废 ${totalAvailable} 件`
                        });
                    });
                }

                let remaining = parsedQuantity;
                let totalScrapValue = 0;

                function finalizeTransaction() {
                    const sumSql = `
                        SELECT COALESCE(SUM(available_quantity), 0) AS new_stock
                        FROM accessory_batch_stock
                        WHERE accessory_id = ?
                    `;

                    db.query(sumSql, [accessory_id], (sumErr, sumRows) => {
                        if (sumErr) {
                            return db.rollback(() => {
                                console.error('汇总配件库存失败:', sumErr);
                                res.json({ success: false, message: '汇总配件库存失败' });
                            });
                        }

                        const newStock = sumRows && sumRows[0] ? (sumRows[0].new_stock || 0) : 0;

                        db.query(
                            'UPDATE accessories SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                            [newStock, accessory_id],
                            (updateAccErr) => {
                                if (updateAccErr) {
                                    return db.rollback(() => {
                                        console.error('更新配件库存失败:', updateAccErr);
                                        res.json({ success: false, message: '更新配件库存失败' });
                                    });
                                }

                                const avgPrice = parsedQuantity > 0 ? (totalScrapValue / parsedQuantity) : 0;

                                db.query(`
                                    INSERT INTO accessory_inventory_records 
                                    (accessory_id, record_type, quantity, unit_price, total_value, reference_type, notes, created_by) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                `, [
                                    accessory_id,
                                    'out',
                                    -parsedQuantity,
                                    avgPrice,
                                    -totalScrapValue,
                                    'scrap',
                                    reason,
                                    req.session.user.id
                                ], (invErr) => {
                                    if (invErr) {
                                        return db.rollback(() => {
                                            console.error('插入库存记录失败:', invErr);
                                            res.json({ success: false, message: '插入库存记录失败' });
                                        });
                                    }

                                    db.commit(commitErr => {
                                        if (commitErr) {
                                            return db.rollback(() => {
                                                console.error('事务提交失败:', commitErr);
                                                res.json({ success: false, message: '事务提交失败' });
                                            });
                                        }

                                        res.json({ success: true, message: '配件已按批次报废' });
                                    });
                                });
                            }
                        );
                    });
                }

                function processRow(index) {
                    if (remaining <= 0 || index >= rows.length) {
                        return finalizeTransaction();
                    }

                    const row = rows[index];
                    const available = row.available_quantity || 0;

                    if (!available) {
                        return processRow(index + 1);
                    }

                    const scrapHere = Math.min(available, remaining);
                    const purchasePrice = parseFloat(row.purchase_price || 0);
                    totalScrapValue += scrapHere * purchasePrice;

                    db.query(
                        `INSERT INTO accessory_scrap_records 
                         (accessory_id, batch_stock_id, device_id, device_code, quantity, purchase_price, scrap_reason, scrap_date, created_by) 
                         VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
                        [
                            accessory_id,
                            row.id,
                            scrapHere,
                            purchasePrice,
                            reason,
                            scrapDate,
                            req.session.user ? req.session.user.id : null
                        ],
                        (insertErr) => {
                            if (insertErr) {
                                return db.rollback(() => {
                                    console.error('插入报废记录失败:', insertErr);
                                    res.json({ success: false, message: '插入报废记录失败' });
                                });
                            }

                            const currentScrapped = row.scrapped_quantity || 0;
                            const newScrapped = currentScrapped + scrapHere;
                            const newAvailable = row.quantity - row.used_quantity - newScrapped;

                            let newStatus;
                            if (newAvailable > 0) {
                                newStatus = row.used_quantity > 0 ? 'in_use' : 'in_stock';
                            } else {
                                newStatus = newScrapped >= row.quantity ? 'scrapped' : 'exhausted';
                            }

                            db.query(
                                `UPDATE accessory_batch_stock 
                                 SET scrapped_quantity = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
                                 WHERE id = ?`,
                                [newScrapped, newStatus, row.id],
                                (updateErr) => {
                                    if (updateErr) {
                                        return db.rollback(() => {
                                            console.error('更新批次库存失败:', updateErr);
                                            res.json({ success: false, message: '更新批次库存失败' });
                                        });
                                    }

                                    remaining -= scrapHere;
                                    processRow(index + 1);
                                }
                            );
                        }
                    );
                }

                processRow(0);
            });
        });

        return;
    }

    // 兼容旧逻辑：如果没有传批次和数量，则报废整个配件库存
    db.beginTransaction(err => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: '事务启动失败' });
        }
        
        // 获取当前库存和价格（使用采购价作为当前单价）
        db.query('SELECT stock_quantity, purchase_price AS current_price FROM accessories WHERE id = ?', [accessory_id], (err, result) => {
            if (err) {
                return db.rollback(() => {
                    console.error(err);
                    res.json({ success: false, message: '获取配件信息失败' });
                });
            }
            
            if (result.length === 0) {
                return db.rollback(() => {
                    res.json({ success: false, message: '配件不存在' });
                });
            }
            
            const { stock_quantity, current_price } = result[0];
            
            // 更新状态为报废
            db.query('UPDATE accessories SET status = ?, stock_quantity = 0 WHERE id = ?', ['scrapped', accessory_id], (err) => {
                if (err) {
                    return db.rollback(() => {
                        console.error(err);
                        res.json({ success: false, message: '更新配件状态失败' });
                    });
                }
                
                // 插入库存记录
                db.query(`
                    INSERT INTO accessory_inventory_records 
                    (accessory_id, record_type, quantity, unit_price, total_value, reference_type, notes, created_by) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    accessory_id, 
                    'out', 
                    -stock_quantity, 
                    current_price, 
                    -stock_quantity * current_price, 
                    'scrap', 
                    reason, 
                    req.session.user.id
                ], (err) => {
                    if (err) {
                        return db.rollback(() => {
                            console.error(err);
                            res.json({ success: false, message: '插入库存记录失败' });
                        });
                    }
                    
                    // 提交事务
                    db.commit(err => {
                        if (err) {
                            return db.rollback(() => {
                                console.error(err);
                                res.json({ success: false, message: '事务提交失败' });
                            });
                        }
                        
                        res.json({ success: true, message: '配件已标记为报废' });
                    });
                });
            });
        });
    });
});

// 配件盘点列表页面
app.get('/accessories/inventory-check', isAuthenticated, (req, res) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const today = new Date().toISOString().slice(0, 10);
    
    // 查询所有盘点记录
    db.query(`
        SELECT ic.*, u.real_name as checked_by_name
        FROM accessory_inventory_checks ic
        LEFT JOIN users u ON ic.checked_by = u.id
        ORDER BY ic.check_date DESC
    `, (err, checks) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        res.render('accessories/inventory-check', {
            checks,
            currentMonth,
            today,
            user: req.session.user,
            moment: moment,
            active: 'accessories',
            pageTitle: '配件库存盘点'
        });
    });
});

// 创建新盘点
app.post('/accessories/inventory-check/create', isAuthenticated, (req, res) => {
    const { check_month, check_date } = req.body;
    
    if (!check_month || !check_date) {
        return res.json({ success: false, message: '参数不完整' });
    }
    
    // 检查是否已有同月盘点
    db.query('SELECT id FROM accessory_inventory_checks WHERE check_month = ?', [check_month], (err, result) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: '查询失败' });
        }
        
        if (result.length > 0) {
            return res.json({ success: false, message: '该月份已有盘点记录' });
        }
        
        // 创建新盘点记录
        db.query(`
            INSERT INTO accessory_inventory_checks 
            (check_date, check_month, checked_by, status) 
            VALUES (?, ?, ?, 'draft')
        `, [check_date, check_month, req.session.user.id], (err, insertResult) => {
            if (err) {
                console.error(err);
                return res.json({ success: false, message: '创建盘点失败' });
            }
            
            res.json({ 
                success: true, 
                check_id: insertResult.insertId,
                message: '盘点创建成功' 
            });
        });
    });
});

// 编辑盘点
app.get('/accessories/inventory-check/edit/:id', isAuthenticated, (req, res) => {
    const checkId = req.params.id;
    
    // 获取盘点信息
    db.query(`
        SELECT ic.*, u.real_name as checked_by_name
        FROM accessory_inventory_checks ic
        LEFT JOIN users u ON ic.checked_by = u.id
        WHERE ic.id = ?
    `, [checkId], (err, checkResult) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (checkResult.length === 0) {
            return res.status(404).send('盘点记录不存在');
        }
        
        const check = checkResult[0];
        
        if (check.status !== 'draft') {
            return res.status(400).send('只能编辑草稿状态的盘点');
        }
        
        // 获取配件列表
        db.query(`
            SELECT 
                a.id, a.name, a.brand, a.stock_quantity, ac.name as category_name,
                COALESCE(aph.price, a.purchase_price) as current_price,
                icd.actual_quantity, icd.reason, icd.action_taken
            FROM accessories a
            LEFT JOIN accessory_categories ac ON a.category_id = ac.id
            LEFT JOIN accessory_price_history aph ON a.id = aph.accessory_id 
            LEFT JOIN (
                SELECT accessory_id, MAX(month_year) as max_month_year 
                FROM accessory_price_history 
                GROUP BY accessory_id
            ) latest_price ON aph.accessory_id = latest_price.accessory_id AND aph.month_year = latest_price.max_month_year
            LEFT JOIN accessory_inventory_check_details icd ON a.id = icd.accessory_id AND icd.check_id = ?
            WHERE a.status != 'scrapped'
            ORDER BY ac.name, a.name
        `, [checkId], (err, accessories) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            // 计算汇总数据
            let totalSystemQuantity = 0;
            let totalActualQuantity = 0;
            let totalDiscrepancies = 0;
            
            accessories.forEach(acc => {
                const systemQuantity = acc.stock_quantity || 0;
                const actualQuantity = acc.actual_quantity || systemQuantity;
                const difference = actualQuantity - systemQuantity;
                
                totalSystemQuantity += systemQuantity;
                totalActualQuantity += actualQuantity;
                totalDiscrepancies += difference;
            });
            
            res.render('accessories/inventory-check-edit', {
                check,
                accessories,
                totalSystemQuantity,
                totalActualQuantity,
                totalDiscrepancies,
                user: req.session.user,
                moment: moment,
                active: 'accessories',
                pageTitle: '编辑盘点'
            });
        });
    });
});

// 保存盘点数据
app.post('/accessories/inventory-check/save/:id', isAuthenticated, (req, res) => {
    const checkId = req.params.id;
    const { status, details, notes, total_discrepancies, total_value_difference } = req.body;
    
    if (!details || !Array.isArray(details)) {
        return res.json({ success: false, message: '盘点详情数据不正确' });
    }
    
    // 开始事务
    db.beginTransaction(err => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: '事务启动失败' });
        }
        
        // 更新盘点主记录
        db.query(`
            UPDATE accessory_inventory_checks 
            SET status = ?, notes = ?, total_discrepancies = ?, total_value_difference = ?
            WHERE id = ?
        `, [status, notes, total_discrepancies, total_value_difference, checkId], (err) => {
            if (err) {
                return db.rollback(() => {
                    console.error(err);
                    res.json({ success: false, message: '更新盘点主记录失败' });
                });
            }
            
            // 删除原有明细
            db.query('DELETE FROM accessory_inventory_check_details WHERE check_id = ?', [checkId], (err) => {
                if (err) {
                    return db.rollback(() => {
                        console.error(err);
                        res.json({ success: false, message: '删除原盘点明细失败' });
                    });
                }
                
                // 插入新的明细
                let completedCount = 0;
                details.forEach(detail => {
                    db.query(`
                        INSERT INTO accessory_inventory_check_details 
                        (check_id, accessory_id, system_quantity, actual_quantity, difference, 
                         unit_price, difference_value, reason, action_taken)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        checkId, detail.accessory_id, detail.system_quantity, detail.actual_quantity,
                        detail.difference, detail.unit_price, detail.difference_value,
                        detail.reason, detail.action_taken
                    ], (err) => {
                        if (err) {
                            console.error('插入盘点明细失败:', err);
                        }
                        
                        completedCount++;
                        if (completedCount === details.length) {
                            // 如果盘点状态是已完成，需要调整系统库存
                            if (status === 'completed') {
                                adjustSystemInventory(checkId, () => {
                                    db.commit(err => {
                                        if (err) {
                                            return db.rollback(() => {
                                                console.error(err);
                                                res.json({ success: false, message: '事务提交失败' });
                                            });
                                        }
                                        
                                        res.json({ success: true, message: '盘点保存成功' });
                                    });
                                });
                            } else {
                                db.commit(err => {
                                    if (err) {
                                        return db.rollback(() => {
                                            console.error(err);
                                            res.json({ success: false, message: '事务提交失败' });
                                        });
                                    }
                                    
                                    res.json({ success: true, message: '草稿保存成功' });
                                });
                            }
                        }
                    });
                });
            });
        });
    });
});

// 调整系统库存
function adjustSystemInventory(checkId, callback) {
    db.query(`
        SELECT accessory_id, difference, action_taken
        FROM accessory_inventory_check_details
        WHERE check_id = ?
    `, [checkId], (err, details) => {
        if (err) {
            console.error(err);
            return callback(err);
        }
        
        let completedCount = 0;
        details.forEach(detail => {
            // 只对需要调整系统库存的记录进行处理
            if (detail.action_taken === 'adjust_system') {
                db.query(`
                    UPDATE accessories 
                    SET stock_quantity = stock_quantity + ? 
                    WHERE id = ?
                `, [detail.difference, detail.accessory_id], (err) => {
                    if (err) {
                        console.error('调整库存失败:', err);
                    }
                    
                    completedCount++;
                    if (completedCount === details.length) {
                        callback(null);
                    }
                });
            } else {
                completedCount++;
                if (completedCount === details.length) {
                    callback(null);
                }
            }
        });
    });
}

// 批准盘点
app.post('/accessories/inventory-check/approve', isAuthenticated, (req, res) => {
    const { check_id } = req.body;
    
    if (!check_id) {
        return res.json({ success: false, message: '参数不完整' });
    }
    
    // 只有管理员可以批准
    if (req.session.user.role !== 'admin') {
        return res.json({ success: false, message: '没有权限执行此操作' });
    }
    
    // 更新状态为已批准
    db.query(
        'UPDATE accessory_inventory_checks SET status = ? WHERE id = ?',
        ['approved', check_id],
        (err) => {
            if (err) {
                console.error(err);
                return res.json({ success: false, message: '批准失败' });
            }
            
            res.json({ success: true, message: '盘点已批准' });
        }
    );
});

// 采购管理
app.get('/purchase-orders', isAuthenticated, (req, res) => {
    db.query('SELECT po.*, s.name as supplier_name, u.real_name as created_by_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id LEFT JOIN users u ON po.created_by = u.id ORDER BY po.created_at DESC', (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        res.render('purchase-orders/index', { 
            orders: results, 
            user: req.session.user,
            moment: moment,
            active: 'purchase-orders',
            pageTitle: '采购管理'
        });
    });
});

// 租赁管理
app.get('/rental-orders', isAuthenticated, (req, res) => {
    // 获取筛选参数
    const { search, status, type, dateRange, startDate, endDate } = req.query;
    
    // 构建查询条件
    let whereConditions = [];
    let queryParams = [];
    
    if (search) {
        whereConditions.push('(ro.order_number LIKE ? OR c.name LIKE ?)');
        queryParams.push(`%${search}%`, `%${search}%`);
    }
    
    if (status) {
        whereConditions.push('ro.status = ?');
        queryParams.push(status);
    }
    
    if (type) {
        whereConditions.push('ro.rental_type = ?');
        queryParams.push(type);
    }
    
    if (dateRange === 'today') {
        whereConditions.push('DATE(ro.created_at) = CURDATE()');
    } else if (dateRange === 'week') {
        whereConditions.push('YEARWEEK(ro.created_at) = YEARWEEK(NOW())');
    } else if (dateRange === 'month') {
        whereConditions.push('YEAR(ro.created_at) = YEAR(NOW()) AND MONTH(ro.created_at) = MONTH(NOW())');
    } else if (dateRange === 'quarter') {
        whereConditions.push('QUARTER(ro.created_at) = QUARTER(NOW()) AND YEAR(ro.created_at) = YEAR(NOW())');
    } else if (dateRange === 'year') {
        whereConditions.push('YEAR(ro.created_at) = YEAR(NOW())');
    }
    
    if (startDate) {
        whereConditions.push('ro.created_at >= ?');
        queryParams.push(startDate + ' 00:00:00');
    }
    
    if (endDate) {
        whereConditions.push('ro.created_at <= ?');
        queryParams.push(endDate + ' 23:59:59');
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    // 获取订单列表
    db.query(`
        SELECT ro.*, c.name as customer_name, u.real_name as salesperson_name, p.name as partner_name,
               COUNT(roi.id) as device_count
        FROM rental_orders ro 
        LEFT JOIN customers c ON ro.customer_id = c.id 
        LEFT JOIN users u ON ro.salesperson_id = u.id
        LEFT JOIN partners p ON ro.partner_id = p.id
        LEFT JOIN rental_order_items roi ON ro.id = roi.order_id
        ${whereClause}
        GROUP BY ro.id
        ORDER BY ro.created_at DESC
    `, queryParams, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 获取统计数据
        db.query(`
            SELECT 
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired,
                SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returned
            FROM rental_orders
        `, (err, statsResult) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            res.render('rental-orders/index', { 
                orders: results, 
                stats: statsResult[0] || { pending: 0, active: 0, expired: 0, returned: 0 },
                user: req.session.user,
                moment: moment,
                active: 'rental-orders',
                pageTitle: '租赁管理'
            });
        });
    });
});

// 创建租赁订单页面
app.get('/rental-orders/add', isAuthenticated, (req, res) => {
    // 获取客户列表
    db.query('SELECT * FROM customers ORDER BY name', (err, customers) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        console.log('查询到客户数量:', customers ? customers.length : 0);
        
        // 获取合作伙伴列表
        db.query('SELECT * FROM partners WHERE status = "active" ORDER BY name', (err, partners) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            // 获取可用设备列表，包含产品信息和租金
            db.query(`
                SELECT d.id, d.serial_number, d.status, d.device_code,
                       p.name as product_name, p.product_code, 
                       COALESCE(p.specifications, p.model_number) as specifications,
                       COALESCE(p.rental_price_per_day, p.calculated_daily_rent) as rental_price_per_day,
                       COALESCE(p.rental_price_per_month, p.calculated_monthly_rent) as rental_price_per_month
                FROM devices d
                JOIN products p ON d.product_id = p.id
                WHERE d.status IN ('in_warehouse', 'available')
                ORDER BY p.product_code, d.serial_number
            `, (err, devices) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器错误');
                }
                
                console.log('查询到设备数量:', devices ? devices.length : 0);
                
                res.render('rental-orders/add-new', {
                    customers: customers,
                    partners: partners,
                    devices: devices,
                    user: req.session.user,
                    moment: moment,
                    active: 'rental-orders',
                    pageTitle: '创建租赁订单'
                });
            });
        });
    });
});

// 处理创建租赁订单
app.post('/rental-orders/add', isAuthenticated, (req, res) => {
    console.log('=== 收到创建订单请求 ===');
    console.log('请求数据:', JSON.stringify(req.body, null, 2));
    
    const {
        orderNumber,
        orderDate,
        customerId,
        partnerId,
        paymentCycle,
        startDate,
        endDate,
        deposit,
        totalAmount,
        notes,
        deviceItems
    } = req.body;
    
    // 验证必填字段
    console.log('验证字段:', {
        orderNumber: !!orderNumber,
        orderDate: !!orderDate,
        customerId: !!customerId,
        paymentCycle: !!paymentCycle,
        startDate: !!startDate,
        deviceItems: deviceItems ? deviceItems.length : 0
    });
    
    if (!orderNumber || !orderDate || !customerId || !paymentCycle || !startDate || !deviceItems || deviceItems.length === 0) {
        console.error('验证失败：缺少必填字段');
        return res.status(400).json({ success: false, message: '请填写所有必填字段并添加至少一个设备' });
    }

    const normalizedOrderDate = orderDate || new Date().toISOString().split('T')[0];
    const dateStr = normalizedOrderDate.replace(/-/g, '');
    const orderPrefix = `DD${dateStr}`;

    // 先根据日期前缀查出当日已存在的最大订单号，生成不重复的新订单号
    const maxOrderSql = 'SELECT order_number FROM rental_orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1';
    db.query(maxOrderSql, [`${orderPrefix}%`], (maxErr, maxRows) => {
        if (maxErr) {
            console.error('查询当日最大订单号失败:', maxErr);
            return res.status(500).json({ success: false, message: '生成订单号失败: ' + maxErr.message });
        }

        let finalOrderNumber = orderNumber;
        if (!finalOrderNumber || (maxRows && maxRows.length > 0)) {
            let nextSeq = 1;
            if (maxRows && maxRows.length > 0 && maxRows[0].order_number) {
                const lastOrderNumber = maxRows[0].order_number;
                const suffix = lastOrderNumber.slice(orderPrefix.length);
                const lastSeq = parseInt(suffix, 10);
                if (!Number.isNaN(lastSeq)) {
                    nextSeq = lastSeq + 1;
                }
            }
            finalOrderNumber = `${orderPrefix}${String(nextSeq).padStart(4, '0')}`;
        }

        console.log(`最终使用的订单号: ${finalOrderNumber} (前端传入: ${orderNumber || '无'})`);
    
        // 开始事务
        db.beginTransaction(err => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: '事务启动失败' });
            }
            
            // 插入租赁订单
            const orderQuery = `
            INSERT INTO rental_orders (
                order_number, customer_id, partner_id, order_date, start_date, end_date,
                payment_cycle, total_amount, deposit, notes, salesperson_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `;
        
        const orderValues = [
            finalOrderNumber,
            customerId,
            partnerId || null,
            orderDate,
            startDate,
            endDate || null,
            paymentCycle,
            totalAmount,
            deposit || 0,
            notes || '',
            req.session.user.id
        ];
        
        db.query(orderQuery, orderValues, (err, result) => {
            if (err) {
                console.error('创建订单失败:', err);
                return db.rollback(() => {
                    res.status(500).json({ success: false, message: '创建租赁订单失败: ' + err.message });
                });
            }
            
            console.log('✓ 订单创建成功, ID:', result.insertId);
            const orderId = result.insertId;
            
            // 插入租赁订单项
            let completedItems = 0;
            const totalItems = deviceItems.length;
            
            console.log(`开始插入 ${totalItems} 个订单项...`);
            
            deviceItems.forEach((item, index) => {
                console.log(`插入订单项 ${index + 1}:`, item);
                
                const itemQuery = `
                    INSERT INTO rental_order_items (
                        order_id, device_id, device_code, specifications, quantity,
                        daily_rate, monthly_rate, start_date, end_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                
                const itemValues = [
                    orderId,
                    item.deviceId,
                    item.deviceCode,
                    item.specifications,
                    item.quantity,
                    item.dailyRate,
                    item.monthlyRate,
                    startDate,
                    endDate || null
                ];
                
                db.query(itemQuery, itemValues, (err) => {
                    if (err) {
                        console.error('插入订单项失败:', err);
                        return db.rollback(() => {
                            res.status(500).json({ success: false, message: '创建租赁订单项失败: ' + err.message });
                        });
                    }
                    
                    console.log(`✓ 订单项 ${index + 1} 插入成功`);
                    
                    // 更新设备状态
                    db.query(
                        'UPDATE devices SET status = "rented" WHERE id = ?',
                        [item.deviceId],
                        (err) => {
                            if (err) {
                                console.error('更新设备状态失败:', err);
                                return db.rollback(() => {
                                    res.status(500).json({ success: false, message: '更新设备状态失败: ' + err.message });
                                });
                            }
                            
                            console.log(`✓ 设备 ${item.deviceId} 状态已更新`);
                            
                            completedItems++;
                            if (completedItems === totalItems) {
                                // 如果有合作伙伴，计算并记录佣金
                                if (partnerId) {
                                    // 获取合作伙伴的佣金比例
                                    db.query('SELECT commission_rate FROM partners WHERE id = ?', [partnerId], (err, partnerResult) => {
                                        if (err || partnerResult.length === 0) {
                                            console.error(err || '未找到合作伙伴信息');
                                            return commitTransaction();
                                        }
                                        
                                        const commissionRate = parseFloat(partnerResult[0].commission_rate);
                                        const commissionAmount = parseFloat(totalAmount) * (commissionRate / 100);
                                        
                                        // 插入佣金记录
                                        db.query(`
                                            INSERT INTO commission_records (
                                                partner_id, rental_order_id, commission_amount, 
                                                commission_rate, status
                                            ) VALUES (?, ?, ?, ?, 'pending')
                                        `, [partnerId, orderId, commissionAmount, commissionRate], (err) => {
                                            if (err) {
                                                console.error('创建佣金记录失败:', err);
                                            }
                                            commitTransaction();
                                        });
                                    });
                                } else {
                                    commitTransaction();
                                }
                            }
                        }
                    );
                });
            });
            
            function commitTransaction() {
                db.commit(err => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).json({ success: false, message: '事务提交失败' });
                        });
                    }
                    
                    res.json({ success: true, message: '租赁订单创建成功', orderId: orderId });
                });
            }
        });
    });
});
});

// 查看租赁订单详情
app.get('/rental-orders/view/:id', isAuthenticated, (req, res) => {
    const orderId = req.params.id;
    
    // 查询订单基本信息
    const orderQuery = `
        SELECT ro.*, c.name as customer_name, c.contact_person, c.phone as contact_phone,
               p.name as partner_name, u.real_name as salesperson_name
        FROM rental_orders ro
        LEFT JOIN customers c ON ro.customer_id = c.id
        LEFT JOIN partners p ON ro.partner_id = p.id
        LEFT JOIN users u ON ro.salesperson_id = u.id
        WHERE ro.id = ?
    `;
    
    db.query(orderQuery, [orderId], (err, orderResults) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (orderResults.length === 0) {
            return res.status(404).send('订单不存在');
        }
        
        const order = orderResults[0];

        // 如果订单为进行中且结束日期已过期，则自动顺延一年
        const today = moment().startOf('day');
        let needExtendEndDate = false;
        let newEndDate = null;

        if (order.status === 'active' && order.end_date) {
            const endDateMoment = moment(order.end_date);
            if (today.isAfter(endDateMoment, 'day')) {
                needExtendEndDate = true;
                newEndDate = endDateMoment.add(1, 'year').toDate();
                order.end_date = newEndDate;
            }
        }

        const fetchItemsAndRender = () => {
            // 查询订单项（设备列表）
            const itemsQuery = `
                SELECT roi.*, d.device_code, d.serial_number,
                       p.name as product_name, p.product_code
                FROM rental_order_items roi
                LEFT JOIN devices d ON roi.device_id = d.id
                LEFT JOIN products p ON d.product_id = p.id
                WHERE roi.order_id = ?
            `;

            // 查询租金调整历史记录
            const adjustmentsQuery = `
                SELECT
                    a.id,
                    a.order_item_id,
                    a.device_code,
                    a.old_monthly_rate,
                    a.new_monthly_rate,
                    a.adjust_effective_date,
                    a.created_at,
                    u.real_name AS adjusted_by_name
                FROM rental_rent_adjustments a
                LEFT JOIN users u ON a.adjusted_by = u.id
                WHERE a.order_id = ?
                ORDER BY a.created_at DESC, a.id DESC
            `;

            db.query(itemsQuery, [orderId], (err, items) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器错误');
                }

                db.query(adjustmentsQuery, [orderId], (adjErr, adjustments) => {
                    if (adjErr) {
                        // 如果租金调整历史表尚未创建，则忽略错误并继续渲染页面
                        if (adjErr.code === 'ER_NO_SUCH_TABLE') {
                            adjustments = [];
                        } else {
                            console.error(adjErr);
                            return res.status(500).send('服务器错误');
                        }
                    }

                    res.render('rental-orders/view', {
                        order: order,
                        items: items,
                        adjustments: adjustments || [],
                        user: req.session.user,
                        moment: moment,
                        active: 'rental-orders',
                        pageTitle: '订单详情'
                    });
                });
            });
        };

        if (needExtendEndDate) {
            db.query(
                'UPDATE rental_orders SET end_date = ? WHERE id = ?',
                [newEndDate, orderId],
                (updateErr) => {
                    if (updateErr) {
                        console.error('自动顺延结束日期失败:', updateErr);
                    }
                    fetchItemsAndRender();
                }
            );
        } else {
            fetchItemsAndRender();
        }
    });
});

// 设备交货单
app.get('/rental-orders/delivery-note/:id', isAuthenticated, (req, res) => {
    const orderId = req.params.id;
    
    // 查询订单基本信息
    const orderQuery = `
        SELECT ro.*, c.name as customer_name, c.contact_person, c.phone as contact_phone,
               c.address as customer_address,
               p.name as partner_name, u.real_name as salesperson_name
        FROM rental_orders ro
        LEFT JOIN customers c ON ro.customer_id = c.id
        LEFT JOIN partners p ON ro.partner_id = p.id
        LEFT JOIN users u ON ro.salesperson_id = u.id
        WHERE ro.id = ?
    `;
    
    db.query(orderQuery, [orderId], (err, orderResults) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (orderResults.length === 0) {
            return res.status(404).send('订单不存在');
        }
        
        const order = orderResults[0];

        // 查询订单项（设备列表）及设备价值
        const itemsQuery = `
            SELECT roi.*, d.device_code, d.serial_number,
                   p.name as product_name, p.product_code,
                   roi.specifications as specifications,
                   pc.name as category_name,
                   (SELECT COALESCE(SUM(da.purchase_price * da.quantity), 0)
                    FROM device_assemblies da
                    WHERE da.device_id = d.id) as device_value
            FROM rental_order_items roi
            LEFT JOIN devices d ON roi.device_id = d.id
            LEFT JOIN products p ON d.product_id = p.id
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            WHERE roi.order_id = ?
            ORDER BY pc.name, p.name
        `;

        db.query(itemsQuery, [orderId], (err, items) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }

            res.render('rental-orders/delivery-note', {
                order: order,
                items: items,
                moment: moment
            });
        });
    });
});

// 调整租金页面（列出指定客户进行中订单的在租设备）
app.get('/rental-orders/adjust-rent', isAuthenticated, (req, res) => {
    const customerId = req.query.customerId;
    
    // 如果指定了客户ID，先查询客户名称
    if (customerId) {
        db.query('SELECT name FROM customers WHERE id = ?', [customerId], (err, customers) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            const customerName = customers.length > 0 ? customers[0].name : null;
            
            // 查询租赁项
            queryRentalItems(customerId, customerName);
        });
    } else {
        // 没有指定客户，直接查询所有
        queryRentalItems(null, null);
    }
    
    function queryRentalItems(custId, custName) {
        let query = `
            SELECT
                roi.id AS item_id,
                roi.order_id,
                roi.monthly_rate,
                roi.daily_rate,
                roi.specifications AS specifications,
                roi.start_date,
                roi.end_date,
                ro.order_number,
                ro.customer_id,
                ro.status AS order_status,
                c.name AS customer_name,
                d.device_code,
                d.serial_number,
                p.name AS product_name,
                p.product_code,
                p.specifications AS product_specifications
            FROM rental_order_items roi
            JOIN rental_orders ro ON roi.order_id = ro.id
            JOIN customers c ON ro.customer_id = c.id
            JOIN devices d ON roi.device_id = d.id
            LEFT JOIN products p ON d.product_id = p.id
            WHERE ro.status = 'active'
              AND roi.actual_return_date IS NULL
        `;
        
        const queryParams = [];
        
        // 如果提供了客户ID，添加客户过滤条件
        if (custId) {
            query += ' AND ro.customer_id = ?';
            queryParams.push(custId);
        }
        
        query += ' ORDER BY c.name, ro.order_number, d.device_code, d.serial_number';

        db.query(query, queryParams, (err, items) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }

            res.render('rental-orders/adjust-rent', {
                items: items,
                customerId: custId || null,
                customerName: custName,
                user: req.session.user,
                moment: moment,
                active: 'rental-orders',
                pageTitle: '调整租金'
            });
        });
    }
});

// 编辑租赁订单
app.get('/rental-orders/edit/:id', isAuthenticated, (req, res) => {
    const orderId = req.params.id;

    const orderQuery = `
        SELECT ro.*, c.name as customer_name, c.contact_person, c.phone as contact_phone,
               p.name as partner_name, u.real_name as salesperson_name
        FROM rental_orders ro
        LEFT JOIN customers c ON ro.customer_id = c.id
        LEFT JOIN partners p ON ro.partner_id = p.id
        LEFT JOIN users u ON ro.salesperson_id = u.id
        WHERE ro.id = ?
    `;

    db.query(orderQuery, [orderId], (err, orderResults) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }

        if (orderResults.length === 0) {
            return res.status(404).send('订单不存在');
        }

        const order = orderResults[0];

        const itemsQuery = `
            SELECT roi.*, d.device_code, d.serial_number,
                   p.name as product_name, p.product_code
            FROM rental_order_items roi
            LEFT JOIN devices d ON roi.device_id = d.id
            LEFT JOIN products p ON d.product_id = p.id
            WHERE roi.order_id = ?
        `;

        db.query(itemsQuery, [orderId], (err, items) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }

            res.render('rental-orders/edit', {
                order: order,
                items: items,
                user: req.session.user,
                moment: moment,
                active: 'rental-orders',
                pageTitle: '编辑租赁订单'
            });
        });
    });
});

// 保存编辑后的租赁订单
app.post('/rental-orders/edit/:id', isAuthenticated, (req, res) => {
    const orderId = req.params.id;
    const {
        startDate,
        endDate,
        paymentCycle,
        deposit,
        totalAmount,
        notes
    } = req.body;

    const updateQuery = `
        UPDATE rental_orders
        SET start_date = ?,
            end_date = ?,
            payment_cycle = ?,
            deposit = ?,
            total_amount = ?,
            notes = ?
        WHERE id = ?
    `;

    const values = [
        startDate,
        endDate || null,
        paymentCycle,
        deposit || 0,
        totalAmount || 0,
        notes || '',
        orderId
    ];

    db.query(updateQuery, values, (err) => {
        if (err) {
            console.error(err);
            req.session.errorMessage = '更新租赁订单失败';
            return res.redirect('/rental-orders');
        }

        req.session.successMessage = '租赁订单更新成功';
        res.redirect(`/rental-orders/view/${orderId}`);
    });
});

// 退租管理列表
app.get('/returns', isAuthenticated, (req, res) => {
    db.query('SELECT rr.*, ro.order_number, c.name as customer_name, u1.real_name as returned_by_name, u2.real_name as processed_by_name FROM return_records rr LEFT JOIN rental_orders ro ON rr.rental_order_id = ro.id LEFT JOIN customers c ON ro.customer_id = c.id LEFT JOIN users u1 ON rr.returned_by = u1.id LEFT JOIN users u2 ON rr.processed_by = u2.id ORDER BY rr.created_at DESC', (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        res.render('returns/index', { 
            returns: results, 
            user: req.session.user,
            moment: moment,
            active: 'returns',
            pageTitle: '退租管理'
        });
    });
});

// 创建退租记录页面
app.get('/returns/add', isAuthenticated, (req, res) => {
    const ordersQuery = `
        SELECT ro.id, ro.order_number, ro.deposit, c.name as customer_name
        FROM rental_orders ro
        JOIN customers c ON ro.customer_id = c.id
        WHERE ro.status = 'active'
        ORDER BY ro.created_at DESC
    `;

    db.query(ordersQuery, (err, orders) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }

        const devicesQuery = `
            SELECT
                roi.id AS item_id,
                roi.order_id,
                ro.order_number,
                c.id AS customer_id,
                c.name AS customer_name,
                ro.deposit,
                d.id AS device_id,
                d.device_code,
                d.serial_number,
                p.name AS product_name,
                p.product_code,
                roi.start_date,
                roi.end_date,
                roi.actual_return_date,
                d.status AS device_status
            FROM rental_order_items roi
            JOIN rental_orders ro ON roi.order_id = ro.id
            JOIN customers c ON ro.customer_id = c.id
            JOIN devices d ON roi.device_id = d.id
            LEFT JOIN products p ON d.product_id = p.id
            WHERE ro.status = 'active'
              AND roi.actual_return_date IS NULL
            ORDER BY c.name, ro.order_number, d.device_code, d.serial_number
        `;

        db.query(devicesQuery, (deviceErr, devices) => {
            if (deviceErr) {
                console.error(deviceErr);
                return res.status(500).send('服务器错误');
            }

            // 从设备列表中整理出有在租设备的客户列表
            const customerMap = new Map();
            devices.forEach(device => {
                if (device.customer_id && !customerMap.has(device.customer_id)) {
                    customerMap.set(device.customer_id, {
                        id: device.customer_id,
                        name: device.customer_name
                    });
                }
            });

            const customers = Array.from(customerMap.values());

            res.render('returns/add', {
                orders: orders,
                devices: devices,
                customers: customers,
                user: req.session.user,
                moment: moment,
                active: 'returns',
                pageTitle: '退租处理'
            });
        });
    });
});

// 调整租金（批量更新选中设备的月租金）
app.post('/rental-orders/adjust-rent', isAuthenticated, (req, res) => {
    let { adjustDate, newMonthlyRate, itemIds } = req.body;

    if (!adjustDate || !newMonthlyRate) {
        req.session.errorMessage = '请填写调整日期和新的月租金';
        return res.redirect('/rental-orders/adjust-rent');
    }

    const parsedRate = parseFloat(newMonthlyRate);
    if (isNaN(parsedRate) || parsedRate <= 0) {
        req.session.errorMessage = '新的月租金必须为大于0的数字';
        return res.redirect('/rental-orders/adjust-rent');
    }

    if (!itemIds) {
        req.session.errorMessage = '请至少选择一台要调整租金的设备';
        return res.redirect('/rental-orders/adjust-rent');
    }

    if (!Array.isArray(itemIds)) {
        itemIds = [itemIds];
    }

    const parsedIds = itemIds
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));

    if (parsedIds.length === 0) {
        req.session.errorMessage = '未能识别要调整的设备，请重试';
        return res.redirect('/rental-orders/adjust-rent');
    }

    // 先查询这些设备当前的租金和订单信息，用于记录调整历史
    const selectItemsSql = `
        SELECT roi.id AS item_id,
               roi.order_id,
               roi.device_id,
               roi.monthly_rate AS old_monthly_rate,
               d.device_code
        FROM rental_order_items roi
        LEFT JOIN devices d ON roi.device_id = d.id
        WHERE roi.id IN (?)
    `;

    db.query(selectItemsSql, [parsedIds], (selectErr, itemRows) => {
        if (selectErr) {
            console.error(selectErr);
            req.session.errorMessage = '查询设备信息失败，请稍后重试';
            return res.redirect('/rental-orders/adjust-rent');
        }

        if (!itemRows || !itemRows.length) {
            req.session.errorMessage = '未找到要调整的设备明细记录';
            return res.redirect('/rental-orders/adjust-rent');
        }

        db.beginTransaction(txErr => {
            if (txErr) {
                console.error(txErr);
                req.session.errorMessage = '启动事务失败，请稍后重试';
                return res.redirect('/rental-orders/adjust-rent');
            }

            db.query(
                'UPDATE rental_order_items SET monthly_rate = ? WHERE id IN (?)',
                [parsedRate, parsedIds],
                (updateErr) => {
                    if (updateErr) {
                        return db.rollback(() => {
                            console.error(updateErr);
                            req.session.errorMessage = '更新月租金失败，请稍后重试';
                            res.redirect('/rental-orders/adjust-rent');
                        });
                    }

                    // 写入租金调整历史记录
                    const insertValues = itemRows.map(row => [
                        row.order_id,
                        row.item_id,
                        row.device_id || null,
                        row.device_code || null,
                        row.old_monthly_rate || 0,
                        parsedRate,
                        adjustDate,
                        req.session.user ? req.session.user.id : null,
                        null
                    ]);

                    const insertSql = `
                        INSERT INTO rental_rent_adjustments (
                            order_id,
                            order_item_id,
                            device_id,
                            device_code,
                            old_monthly_rate,
                            new_monthly_rate,
                            adjust_effective_date,
                            adjusted_by,
                            notes
                        ) VALUES ?
                    `;

                    db.query(insertSql, [insertValues], (insertErr) => {
                        if (insertErr) {
                            return db.rollback(() => {
                                console.error(insertErr);
                                req.session.errorMessage = '保存租金调整历史失败，请稍后重试';
                                res.redirect('/rental-orders/adjust-rent');
                            });
                        }

                        db.commit(commitErr => {
                            if (commitErr) {
                                return db.rollback(() => {
                                    console.error(commitErr);
                                    req.session.errorMessage = '提交事务失败，请稍后重试';
                                    res.redirect('/rental-orders/adjust-rent');
                                });
                            }

                            req.session.successMessage = '已成功调整选中设备的月租金';
                            res.redirect('/rental-orders');
                        });
                    });
                }
            );
        });
    });
});

// 保存退租记录并归还设备（支持同一订单部分设备退租）
app.post('/returns/add', isAuthenticated, (req, res) => {
    const {
        rentalOrderId,
        returnDate,
        conditionStatus,
        damageDescription,
        repairCost,
        penaltyFee,
        notes,
        deviceItemIds
    } = req.body;

    if (!rentalOrderId || !conditionStatus) {
        req.session.errorMessage = '请选择租赁订单并填写设备状况';
        return res.redirect('/returns/add');
    }

    let selectedItemIds = deviceItemIds;
    if (!selectedItemIds || (Array.isArray(selectedItemIds) && selectedItemIds.length === 0)) {
        req.session.errorMessage = '请至少选择一台要退租的设备';
        return res.redirect('/returns/add');
    }

    if (!Array.isArray(selectedItemIds)) {
        selectedItemIds = [selectedItemIds];
    }

    const parsedItemIds = selectedItemIds
        .map(id => parseInt(id, 10))
        .filter(id => !Number.isNaN(id));

    if (parsedItemIds.length === 0) {
        req.session.errorMessage = '选择的设备无效，请重新选择';
        return res.redirect('/returns/add');
    }

    const parsedRepairCost = parseFloat(repairCost || 0) || 0;
    const parsedPenaltyFee = parseFloat(penaltyFee || 0) || 0;
    const totalDeduction = parsedRepairCost + parsedPenaltyFee;

    db.beginTransaction(err => {
        if (err) {
            console.error(err);
            req.session.errorMessage = '事务启动失败';
            return res.redirect('/returns/add');
        }

        // 查询订单信息
        db.query('SELECT * FROM rental_orders WHERE id = ?', [rentalOrderId], (err, orderResult) => {
            if (err) {
                return db.rollback(() => {
                    console.error(err);
                    req.session.errorMessage = '查询订单失败';
                    res.redirect('/returns/add');
                });
            }

            if (orderResult.length === 0) {
                return db.rollback(() => {
                    req.session.errorMessage = '租赁订单不存在';
                    res.redirect('/returns/add');
                });
            }

            const order = orderResult[0];

            if (order.status !== 'active') {
                return db.rollback(() => {
                    req.session.errorMessage = '只有进行中的订单才能退租';
                    res.redirect('/returns/add');
                });
            }

            const deposit = parseFloat(order.deposit || 0) || 0;
            const refundAmount = Math.max(deposit - totalDeduction, 0);
            const actualReturnDate = returnDate || moment().format('YYYY-MM-DD');

            const insertReturnQuery = `
                INSERT INTO return_records (
                    rental_order_id, return_date, returned_by, condition_status, damage_description,
                    repair_cost, penalty_fee, total_deduction, refund_amount, notes, processed_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const insertValues = [
                rentalOrderId,
                actualReturnDate,
                req.session.user.id,
                conditionStatus,
                damageDescription || null,
                parsedRepairCost,
                parsedPenaltyFee,
                totalDeduction,
                refundAmount,
                notes || null,
                req.session.user.id
            ];

            db.query(insertReturnQuery, insertValues, (err) => {
                if (err) {
                    return db.rollback(() => {
                        console.error(err);
                        req.session.errorMessage = '保存退租记录失败';
                        res.redirect('/returns/add');
                    });
                }

                // 标记选中的设备项为已归还
                db.query(
                    'UPDATE rental_order_items SET actual_return_date = ? WHERE id IN (?)',
                    [actualReturnDate, parsedItemIds],
                    (updateItemsErr) => {
                        if (updateItemsErr) {
                            return db.rollback(() => {
                                console.error(updateItemsErr);
                                req.session.errorMessage = '更新设备项归还日期失败';
                                res.redirect('/returns/add');
                            });
                        }

                        // 查询这些设备ID
                        db.query(
                            'SELECT DISTINCT device_id FROM rental_order_items WHERE id IN (?)',
                            [parsedItemIds],
                            (deviceIdErr, deviceRows) => {
                                if (deviceIdErr) {
                                    return db.rollback(() => {
                                        console.error(deviceIdErr);
                                        req.session.errorMessage = '查询设备信息失败';
                                        res.redirect('/returns/add');
                                    });
                                }

                                const deviceIds = deviceRows.map(row => row.device_id);

                                const updateDevicesStatus = (callback) => {
                                    if (deviceIds.length === 0) {
                                        return callback();
                                    }

                                    db.query(
                                        'UPDATE devices SET status = "available" WHERE id IN (?)',
                                        [deviceIds],
                                        (updateDevicesErr) => {
                                            if (updateDevicesErr) {
                                                return db.rollback(() => {
                                                    console.error('更新设备状态失败:', updateDevicesErr);
                                                    req.session.errorMessage = '更新设备状态失败';
                                                    res.redirect('/returns/add');
                                                });
                                            }
                                            callback();
                                        }
                                    );
                                };

                                // 检查此订单是否还有未归还设备
                                const checkAndUpdateOrderStatus = () => {
                                    db.query(
                                        'SELECT COUNT(*) AS remaining FROM rental_order_items WHERE order_id = ? AND actual_return_date IS NULL',
                                        [rentalOrderId],
                                        (countErr, countRows) => {
                                            if (countErr) {
                                                return db.rollback(() => {
                                                    console.error(countErr);
                                                    req.session.errorMessage = '检查订单剩余设备失败';
                                                    res.redirect('/returns/add');
                                                });
                                            }

                                            const remaining = countRows[0].remaining || 0;

                                            const commitAndFinish = () => {
                                                db.commit(err => {
                                                    if (err) {
                                                        return db.rollback(() => {
                                                            console.error(err);
                                                            req.session.errorMessage = '事务提交失败';
                                                            res.redirect('/returns/add');
                                                        });
                                                    }

                                                    req.session.successMessage = '退租处理成功，设备已归还';
                                                    res.redirect('/returns');
                                                });
                                            };

                                            if (remaining === 0) {
                                                // 所有设备都已归还，更新订单状态为已归还
                                                db.query(
                                                    'UPDATE rental_orders SET status = "returned" WHERE id = ?',
                                                    [rentalOrderId],
                                                    (updateOrderErr) => {
                                                        if (updateOrderErr) {
                                                            return db.rollback(() => {
                                                                console.error(updateOrderErr);
                                                                req.session.errorMessage = '更新订单状态失败';
                                                                res.redirect('/returns/add');
                                                            });
                                                        }
                                                        commitAndFinish();
                                                    }
                                                );
                                            } else {
                                                // 还有未归还设备，订单保持进行中
                                                commitAndFinish();
                                            }
                                        }
                                    );
                                };

                                updateDevicesStatus(checkAndUpdateOrderStatus);
                            }
                        );
                    }
                );
            });
        });
    });
});

// 财务管理
app.get('/finance', isAuthenticated, (req, res) => {
    const accountFilter = req.query.account || '';
    const validAccountCodes = ['public', 'private'];
    const hasAccountFilter = validAccountCodes.includes(accountFilter);

    const recordsWhereClause = hasAccountFilter ? 'WHERE fa.code = ?' : '';
    const recordsParams = hasAccountFilter ? [accountFilter] : [];

    const recordsSql = `
        SELECT 
            fr.*, 
            u.real_name as created_by_name,
            fa.code as account_code,
            fa.name as account_name
        FROM financial_records fr
        LEFT JOIN users u ON fr.created_by = u.id
        LEFT JOIN finance_accounts fa ON fr.account_id = fa.id
        ${recordsWhereClause}
        ORDER BY fr.created_at DESC
    `;

    const accountBalanceSql = `
        SELECT 
            fa.code,
            fa.name,
            COALESCE(SUM(CASE fr.record_type WHEN 'income' THEN fr.amount ELSE -fr.amount END), 0) AS balance
        FROM finance_accounts fa
        LEFT JOIN financial_records fr ON fr.account_id = fa.id
        GROUP BY fa.id
    `;

    const todayCashFlowSql = `
        SELECT COALESCE(SUM(CASE record_type WHEN 'income' THEN amount ELSE -amount END), 0) AS cash_flow
        FROM financial_records
        WHERE transaction_date = CURDATE()
    `;

    const monthCashFlowSql = `
        SELECT COALESCE(SUM(CASE record_type WHEN 'income' THEN amount ELSE -amount END), 0) AS cash_flow
        FROM financial_records
        WHERE YEAR(transaction_date) = YEAR(CURDATE())
          AND MONTH(transaction_date) = MONTH(CURDATE())
    `;

    const pendingPurchaseSql = `
        SELECT 
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_approval_count,
            SUM(
                CASE 
                    WHEN status IN ('approved', 'delivered') AND paid_amount < total_amount THEN 1 
                    ELSE 0 
                END
            ) AS pending_payment_count,
            COALESCE(
                SUM(
                    CASE 
                        WHEN status IN ('approved', 'delivered') AND paid_amount < total_amount 
                        THEN total_amount - paid_amount 
                        ELSE 0 
                    END
                ),
                0
            ) AS pending_payment_amount
        FROM purchase_batches
    `;

    // 依次查询汇总指标和流水列表
    db.query(accountBalanceSql, (balanceErr, balanceRows) => {
        if (balanceErr) {
            console.error(balanceErr);
            return res.status(500).send('服务器错误');
        }

        let publicBalance = 0;
        let privateBalance = 0;
        if (Array.isArray(balanceRows)) {
            balanceRows.forEach(row => {
                if (row.code === 'public') publicBalance = row.balance || 0;
                if (row.code === 'private') privateBalance = row.balance || 0;
            });
        }

        db.query(todayCashFlowSql, (todayErr, todayRows) => {
            if (todayErr) {
                console.error(todayErr);
                return res.status(500).send('服务器错误');
            }

            const todayCashFlow = todayRows && todayRows[0] ? todayRows[0].cash_flow || 0 : 0;

            db.query(monthCashFlowSql, (monthErr, monthRows) => {
                if (monthErr) {
                    console.error(monthErr);
                    return res.status(500).send('服务器错误');
                }

                const monthCashFlow = monthRows && monthRows[0] ? monthRows[0].cash_flow || 0 : 0;

                db.query(pendingPurchaseSql, (pendingErr, pendingRows) => {
                    if (pendingErr) {
                        console.error(pendingErr);
                        return res.status(500).send('服务器错误');
                    }

                    const pendingStats = pendingRows && pendingRows[0] ? pendingRows[0] : {
                        pending_approval_count: 0,
                        pending_payment_count: 0,
                        pending_payment_amount: 0
                    };

                    db.query(recordsSql, recordsParams, (err, results) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).send('服务器错误');
                        }

                        res.render('finance/index', { 
                            records: results, 
                            user: req.session.user,
                            moment: moment,
                            active: 'finance',
                            pageTitle: '财务管理',
                            accountFilter,
                            publicBalance,
                            privateBalance,
                            todayCashFlow,
                            monthCashFlow,
                            pendingStats
                        });
                    });
                });
            });
        });
    });
});

// 经营分析页面
app.get('/finance/business-analysis', isAuthenticated, (req, res) => {
    // 获取当前年月作为默认分析周期
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    res.render('finance/business-analysis', {
        user: req.session.user,
        moment: moment,
        active: 'finance',
        pageTitle: '经营分析',
        currentYear,
        currentMonth
    });
});

// 获取未支付的采购批次列表（供财务待支付采购弹窗使用）
app.get('/api/finance/pending-purchases', isAuthenticated, (req, res) => {
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'finance') {
        return res.status(403).json({ success: false, message: '权限不足' });
    }

    const sql = `
        SELECT 
            pb.id,
            pb.batch_no,
            pb.purchase_date,
            pb.expected_delivery_date,
            pb.total_amount,
            pb.paid_amount,
            (pb.total_amount - pb.paid_amount) AS unpaid_amount,
            pb.status,
            s.name AS supplier_name
        FROM purchase_batches pb
        LEFT JOIN suppliers s ON pb.supplier_id = s.id
        WHERE pb.status IN ('approved', 'delivered')
          AND pb.paid_amount < pb.total_amount
        ORDER BY pb.created_at DESC
    `;

    db.query(sql, (err, rows) => {
        if (err) {
            console.error('查询未支付采购批次失败:', err);
            return res.status(500).json({ success: false, message: '查询未支付采购批次失败' });
        }

        res.json({ success: true, data: rows });
    });
});

// 通用财务记录写入接口（用于固定支出、销售收入等手工录入）
app.post('/api/finance/records', isAuthenticated, (req, res) => {
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'finance') {
        return res.status(403).json({ success: false, message: '权限不足' });
    }

    const {
        record_type,
        category,
        amount,
        transaction_date,
        account_code,
        description,
        reference_id,
        reference_type
    } = req.body;

    if (!record_type || !['income', 'expense'].includes(record_type)) {
        return res.json({ success: false, message: '记录类型不合法' });
    }

    if (!category) {
        return res.json({ success: false, message: '类别不能为空' });
    }

    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
        return res.json({ success: false, message: '金额必须大于0' });
    }

    if (!transaction_date) {
        return res.json({ success: false, message: '交易日期不能为空' });
    }

    const accountCode = account_code === 'private' ? 'private' : 'public';
    const findAccountSql = 'SELECT id FROM finance_accounts WHERE code = ? LIMIT 1';

    db.query(findAccountSql, [accountCode], (accErr, accResults) => {
        if (accErr) {
            console.error('查询财务账户失败:', accErr);
            return res.json({ success: false, message: '查询财务账户失败' });
        }

        const accountId = accResults && accResults[0] ? accResults[0].id : null;

        const insertFinancialRecordSql = `
            INSERT INTO financial_records (
                record_type,
                category,
                amount,
                description,
                reference_id,
                reference_type,
                transaction_date,
                account_id,
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
            insertFinancialRecordSql,
            [
                record_type,
                category,
                numericAmount,
                description || '',
                reference_id || null,
                reference_type || null,
                transaction_date,
                accountId,
                req.session.user.id
            ],
            (frErr, result) => {
                if (frErr) {
                    console.error('写入财务记录失败:', frErr);
                    return res.json({ success: false, message: '写入财务记录失败' });
                }

                res.json({ success: true, id: result.insertId });
            }
        );
    });
});

// API接口：获取净利润数据
app.get('/api/finance/net-profit', isAuthenticated, async (req, res) => {
    const { year, startMonth, endMonth } = req.query;

    if (!year || !startMonth || !endMonth) {
        return res.status(400).json({ success: false, message: '缺少年份或月份参数' });
    }

    const numericYear = parseInt(year, 10);
    const start = parseInt(startMonth, 10);
    const end = parseInt(endMonth, 10);

    if (Number.isNaN(numericYear) || Number.isNaN(start) || Number.isNaN(end)) {
        return res.status(400).json({ success: false, message: '年份或月份格式不正确' });
    }

    if (start > end) {
        return res.status(400).json({ success: false, message: '起始月份不能大于结束月份' });
    }

    const padMonth = (m) => String(m).padStart(2, '0');

    const startDate = `${year}-${padMonth(start)}-01`;
    const lastDay = new Date(numericYear, end, 0).getDate();
    const endDate = `${year}-${padMonth(end)}-${String(lastDay).padStart(2, '0')}`;

    let lastPeriodMonth;
    if (start === 1) {
        lastPeriodMonth = `${numericYear - 1}-12`;
    } else {
        lastPeriodMonth = `${year}-${padMonth(start - 1)}`;
    }

    const currentMonthEnd = `${year}-${padMonth(end)}`;

    const queryAsync = (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.query(sql, params, (err, results) => {
                if (err) {
                    return reject(err);
                }
                resolve(results);
            });
        });
    };

    // 1. 租金收入（使用实收记录）
    const rentalIncomeQuery = `
        SELECT 
            COALESCE(SUM(rrr.received_amount), 0) AS total_rental_income,
            COUNT(DISTINCT rrr.id) AS received_count
        FROM rent_received_records rrr
        WHERE rrr.received_date >= ? AND rrr.received_date <= ?
    `;

    // 2. 固定成本（财务记录中的固定费用）
    const fixedCostsQuery = `
        SELECT SUM(amount) AS total_fixed_costs
        FROM financial_records
        WHERE record_type = 'expense'
        AND category IN ('工资', '租金', '水电费', '办公费', '维修费', '保险费', '税费', '其他固定成本')
        AND transaction_date >= ? AND transaction_date <= ?
    `;

    // 3. 报废配件损失
    const scrapLossQuery = `
        SELECT 
            COALESCE(SUM(asr.quantity * COALESCE(asr.purchase_price, 0)), 0) AS scrap_loss
        FROM accessory_scrap_records asr
        WHERE asr.scrap_date >= ? AND asr.scrap_date <= ?
    `;

    // 4. 期初资产市值
    const beginningAssetsQuery = `
        SELECT 
            SUM(
                pai.quantity * COALESCE(
                    (
                        SELECT aph.price 
                        FROM accessory_price_history aph 
                        WHERE aph.accessory_id = a.id 
                        AND aph.month_year = ?
                        LIMIT 1
                    ),
                    pai.unit_price
                )
            ) AS total_beginning_value
        FROM accessories a
        JOIN purchase_accessory_items pai ON a.id = pai.accessory_id
        JOIN purchase_batches pb ON pai.batch_id = pb.id
        WHERE pb.purchase_date < ?
    `;

    // 5. 期末资产市值
    const endingAssetsQuery = `
        SELECT 
            SUM(
                pai.quantity * COALESCE(
                    (
                        SELECT aph.price 
                        FROM accessory_price_history aph 
                        WHERE aph.accessory_id = a.id 
                        AND aph.month_year = ?
                        LIMIT 1
                    ),
                    pai.unit_price
                )
            ) AS total_ending_value
        FROM accessories a
        JOIN purchase_accessory_items pai ON a.id = pai.accessory_id
        JOIN purchase_batches pb ON pai.batch_id = pb.id
    `;

    // 6. 新增投资（期间内的配件采购金额）
    const newInvestmentQuery = `
        SELECT SUM(pai.quantity * pai.unit_price) AS total_new_investment
        FROM purchase_accessory_items pai
        JOIN purchase_batches pb ON pai.batch_id = pb.id
        WHERE pb.purchase_date >= ? AND pb.purchase_date <= ?
    `;

    try {
        const rentalIncomeRows = await queryAsync(rentalIncomeQuery, [startDate, endDate]);
        const rentalIncome = (rentalIncomeRows[0] && rentalIncomeRows[0].total_rental_income) || 0;
        const receivedCount = (rentalIncomeRows[0] && rentalIncomeRows[0].received_count) || 0;

        const fixedCostsRows = await queryAsync(fixedCostsQuery, [startDate, endDate]);
        const fixedCosts = (fixedCostsRows[0] && fixedCostsRows[0].total_fixed_costs) || 0;

        const scrapLossRows = await queryAsync(scrapLossQuery, [startDate, endDate]);
        const scrapLoss = (scrapLossRows[0] && scrapLossRows[0].scrap_loss) || 0;

        const beginningAssetsRows = await queryAsync(beginningAssetsQuery, [lastPeriodMonth, startDate]);
        const beginningAssetValue = (beginningAssetsRows[0] && beginningAssetsRows[0].total_beginning_value) || 0;

        const endingAssetsRows = await queryAsync(endingAssetsQuery, [currentMonthEnd]);
        const endingAssetValue = (endingAssetsRows[0] && endingAssetsRows[0].total_ending_value) || 0;

        const newInvestmentRows = await queryAsync(newInvestmentQuery, [startDate, endDate]);
        const newInvestment = (newInvestmentRows[0] && newInvestmentRows[0].total_new_investment) || 0;

        // 额外：查询期初和期末的资产数量，用于前端展示计算公式
        let beginningAssetQuantity = 0;
        let endingAssetQuantity = 0;

        try {
            const snapshotMonthEnd = new Date(numericYear, end - 1, 1);
            const snapshotMonthBeginPrev = start === 1
                ? new Date(numericYear - 1, 11, 1)
                : new Date(numericYear, start - 2, 1);

            const snapshotSql = `
                SELECT total_accessory_quantity
                FROM accessory_asset_snapshots
                WHERE snapshot_month = ?
                LIMIT 1
            `;

            const [endSnapshotRows, beginSnapshotRows] = await Promise.all([
                queryAsync(snapshotSql, [snapshotMonthEnd]),
                queryAsync(snapshotSql, [snapshotMonthBeginPrev])
            ]);

            if (endSnapshotRows[0] && endSnapshotRows[0].total_accessory_quantity != null) {
                endingAssetQuantity = parseInt(endSnapshotRows[0].total_accessory_quantity, 10) || 0;
            }
            if (beginSnapshotRows[0] && beginSnapshotRows[0].total_accessory_quantity != null) {
                beginningAssetQuantity = parseInt(beginSnapshotRows[0].total_accessory_quantity, 10) || 0;
            }
        } catch (snapshotErr) {
            console.error('查询资产数量快照失败:', snapshotErr);
        }

        const assetValueChange = endingAssetValue - beginningAssetValue - newInvestment;
        const netProfit = rentalIncome - fixedCosts - scrapLoss + assetValueChange;

        return res.json({
            success: true,
            data: {
                rentalIncome,
                receivedCount,
                fixedCosts,
                scrapLoss,
                beginningAssetValue,
                endingAssetValue,
                beginningAssetQuantity,
                endingAssetQuantity,
                newInvestment,
                assetValueChange,
                netProfit,
                period: `${year}年${start}月-${end}月`
            }
        });
    } catch (err) {
        console.error('获取净利润数据失败:', err);
        return res.status(500).json({ success: false, message: '获取净利润数据失败' });
    }
});


// API接口：获取资产价值变动数据
app.get('/api/finance/asset-value-change', isAuthenticated, (req, res) => {
    const { startYear, startMonth, endYear, endMonth } = req.query;
    
    if (!startYear || !startMonth || !endYear || !endMonth) {
        return res.status(400).json({ success: false, message: '缺少开始或结束年份/月份参数' });
    }
    
    const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
    
    // 获取指定时间范围内的资产价值变动
    const query = `
        SELECT 
            DATE_FORMAT(snapshot_month, '%Y-%m') AS month,
            total_accessory_total_value AS asset_value,
            new_accessory_total_value AS new_investment,
            total_accessory_total_value - LAG(total_accessory_total_value, 1, total_accessory_total_value) OVER (ORDER BY snapshot_month) - new_accessory_total_value AS monthly_value_change
        FROM accessory_asset_snapshots
        WHERE snapshot_month >= ? AND snapshot_month <= ?
        ORDER BY snapshot_month ASC
    `;
    
    db.query(query, [startDate, endDate], (err, results) => {
        if (err) {
            console.error('查询资产价值变动失败:', err);
            return res.status(500).json({ success: false, message: '查询资产价值变动失败' });
        }
        
        res.json({
            success: true,
            data: results
        });
    });
});

// API接口：获取租金收入数据（改为使用实收款）
app.get('/api/finance/rental-income', isAuthenticated, (req, res) => {
    const { startYear, startMonth, endYear, endMonth } = req.query;
    
    if (!startYear || !startMonth || !endYear || !endMonth) {
        return res.status(400).json({ success: false, message: '缺少开始或结束年份/月份参数' });
    }
    
    const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
    // 使用Date对象计算结束月份的最后一天
    const endLastDay = new Date(endYear, endMonth, 0).getDate();
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endLastDay).padStart(2, '0')}`;
    
    // 获取指定时间范围内的实收租金收入（按月汇总）
    const query = `
        SELECT 
            DATE_FORMAT(rrr.received_date, '%Y-%m') as month,
            COALESCE(SUM(rrr.received_amount), 0) as rental_income,
            COUNT(DISTINCT rrr.id) as received_count
        FROM rent_received_records rrr
        WHERE rrr.received_date >= ? AND rrr.received_date <= ?
        GROUP BY month
        ORDER BY month ASC
    `;
    
    db.query(query, [startDate, endDate], (err, results) => {
        if (err) {
            console.error('查询租金收入失败:', err);
            return res.status(500).json({ success: false, message: '查询租金收入失败' });
        }
        
        // 不再查询租金损失，直接返回实收租金
        const formattedResults = results.map(result => ({
            month: result.month,
            rentalIncome: result.rental_income,
            receivedCount: result.received_count
        }));
        
        res.json({
            success: true,
            data: formattedResults
        });
    });
});

// API接口：获取固定成本历史数据
app.get('/api/finance/fixed-costs-history', isAuthenticated, (req, res) => {
    const { startYear, startMonth, endYear, endMonth } = req.query;

    if (!startYear || !startMonth || !endYear || !endMonth) {
        return res.status(400).json({ success: false, message: '缺少开始或结束年份/月份参数' });
    }

    const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
    const endLastDay = new Date(endYear, endMonth, 0).getDate();
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endLastDay).padStart(2, '0')}`;

    const query = `
        SELECT 
            DATE_FORMAT(transaction_date, '%Y-%m') AS month,
            COALESCE(SUM(amount), 0) AS fixed_costs
        FROM financial_records
        WHERE record_type = 'expense'
        AND category IN ('工资', '租金', '水电费', '办公费', '维修费', '保险费', '税费', '其他固定成本')
        AND transaction_date >= ? AND transaction_date <= ?
        GROUP BY month
        ORDER BY month ASC
    `;

    db.query(query, [startDate, endDate], (err, results) => {
        if (err) {
            console.error('查询固定成本历史失败:', err);
            return res.status(500).json({ success: false, message: '查询固定成本历史失败' });
        }

        res.json({
            success: true,
            data: results
        });
    });
});

// 资产统计路由

// 资产统计页面
app.get('/assets', isAuthenticated, (req, res) => {
    res.render('assets/index', { 
        user: req.session.user,
        active: 'assets',
        pageTitle: '资产统计'
    });
});

// 系统设置页面
app.get('/settings', isAuthenticated, (req, res) => {
    db.query(
        'SELECT setting_name, setting_value FROM asset_settings WHERE setting_name IN ("equipment_depreciation_rate", "accessory_depreciation_rate", "external_base_url")',
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }

            const settings = {};
            if (Array.isArray(results)) {
                results.forEach((row) => {
                    settings[row.setting_name] = row.setting_value;
                });
            }

            res.render('settings', {
                user: req.session.user,
                active: 'settings',
                pageTitle: '系统设置',
                settings: settings
            });
        }
    );
});

// 更新二维码访问基础地址
app.post('/settings/external-base-url', isAuthenticated, (req, res) => {
    const externalBaseUrl = (req.body.external_base_url || '').trim();

    db.query('SELECT id FROM asset_settings WHERE setting_name = "external_base_url" LIMIT 1', (err, results) => {
        if (err) {
            console.error(err);
            req.session.errorMessage = '保存设置失败';
            return res.redirect('/settings');
        }

        if (!results || results.length === 0) {
            db.query(
                'INSERT INTO asset_settings (setting_name, setting_value, description) VALUES ("external_base_url", ?, "设备二维码访问基础地址")',
                [externalBaseUrl || (process.env.EXTERNAL_BASE_URL || 'http://192.168.2.74:3000')],
                (insertErr) => {
                    if (insertErr) {
                        console.error(insertErr);
                        req.session.errorMessage = '保存设置失败';
                    } else {
                        req.session.successMessage = '二维码访问基础地址已保存';
                    }
                    res.redirect('/settings');
                }
            );
        } else {
            const id = results[0].id;
            db.query(
                'UPDATE asset_settings SET setting_value = ? WHERE id = ?',
                [externalBaseUrl || (process.env.EXTERNAL_BASE_URL || 'http://192.168.2.74:3000'), id],
                (updateErr) => {
                    if (updateErr) {
                        console.error(updateErr);
                        req.session.errorMessage = '保存设置失败';
                    } else {
                        req.session.successMessage = '二维码访问基础地址已保存';
                    }
                    res.redirect('/settings');
                }
            );
        }
    });
});

// 获取当前资产数据
app.get('/api/assets/current', isAuthenticated, (req, res) => {
    // 1) 已组装设备：按照设备详情页"财务概览"的公式，汇总所有"在用/在库"的设备
    //    配件采购总价（originalPurchasePrice）和折旧后价格总和（currentDepreciatedPrice）
    const deviceSql = `
        SELECT 
            COALESCE(SUM(
                COALESCE(da.purchase_price, abs.purchase_price, a.purchase_price) * da.quantity
            ), 0) AS total_device_original_value,
            COALESCE(SUM(
                COALESCE(latest_price.price, da.purchase_price, abs.purchase_price, a.purchase_price) * da.quantity
            ), 0) AS total_device_current_value
        FROM device_assemblies da
        JOIN devices d ON da.device_id = d.id
        LEFT JOIN accessories a ON da.accessory_id = a.id
        LEFT JOIN accessory_batch_stock abs ON da.batch_stock_id = abs.id
        LEFT JOIN (
            SELECT aph1.*
            FROM accessory_price_history aph1
            JOIN (
                SELECT accessory_id, MAX(month_year) AS max_month_year 
                FROM accessory_price_history 
                GROUP BY accessory_id
            ) latest ON aph1.accessory_id = latest.accessory_id
                     AND aph1.month_year = latest.max_month_year
        ) latest_price ON a.id = latest_price.accessory_id
        WHERE d.status IN ('in_warehouse','available','rented','maintenance','upgraded')
    `;

    db.query(deviceSql, (deviceErr, deviceRows) => {
        if (deviceErr) {
            console.error('查询已组装设备价值失败:', deviceErr);
            return res.status(500).json({ success: false });
        }

        const deviceOriginalValue = parseFloat(deviceRows[0]?.total_device_original_value || 0);
        const deviceCurrentValue = parseFloat(deviceRows[0]?.total_device_current_value || 0);

        // 2) 库存配件：使用"配件库存统计"同样的逻辑
        //    - 采购时价格：按每个批次"库存数量 × 采购单价"汇总（与配件库存统计页面的"采购总价值"一致）
        //    - 现在的价格：按"最新价格 × 库存数量"汇总
        const accessorySql = `
            SELECT 
                COALESCE(SUM(batch_stats.total_purchase_amount), 0) AS total_accessory_original_value,
                COALESCE(SUM(COALESCE(aph.price, a.purchase_price) * a.stock_quantity), 0) AS total_accessory_current_value
            FROM accessories a
            LEFT JOIN accessory_price_history aph ON a.id = aph.accessory_id
            LEFT JOIN (
                SELECT accessory_id, MAX(month_year) AS max_month_year 
                FROM accessory_price_history 
                GROUP BY accessory_id
            ) latest_price ON aph.accessory_id = latest_price.accessory_id 
                          AND aph.month_year = latest_price.max_month_year
            LEFT JOIN (
                SELECT 
                    abs.accessory_id,
                    SUM(abs.available_quantity * abs.purchase_price) AS total_purchase_amount
                FROM accessory_batch_stock abs
                GROUP BY abs.accessory_id
            ) batch_stats ON a.id = batch_stats.accessory_id
            WHERE a.status != 'scrapped'
        `;

        db.query(accessorySql, (accErr, accRows) => {
            if (accErr) {
                console.error('查询配件库存价值失败:', accErr);
                return res.status(500).json({ success: false });
            }

            const accessoryOriginalValue = parseFloat(accRows[0]?.total_accessory_original_value || 0);
            const accessoryCurrentValue = parseFloat(accRows[0]?.total_accessory_current_value || 0);

            // 设备总价值：分为采购时价格和现在的价格
            const equipmentOriginalValue = deviceOriginalValue;
            const equipmentCurrentValue = deviceCurrentValue;

            // 配件总价值：库存配件的采购价和现在价
            const accessoryOriginalTotal = accessoryOriginalValue;
            const accessoryCurrentTotal = accessoryCurrentValue;

            // 资产总值：设备 + 配件
            const assetOriginalValue = equipmentOriginalValue + accessoryOriginalTotal;
            const assetCurrentValue = equipmentCurrentValue + accessoryCurrentTotal;

            // 累计折旧 / 资产贬值：现在的总价值 - 采购时的总价值（通常为负数）
            const totalDepreciation = assetCurrentValue - assetOriginalValue;

            res.json({
                success: true,
                equipmentOriginalValue,
                equipmentCurrentValue,
                accessoryOriginalValue: accessoryOriginalTotal,
                accessoryCurrentValue: accessoryCurrentTotal,
                assetOriginalValue,
                assetCurrentValue,
                totalDepreciation
            });
        });
    });
});

// 获取资产历史数据
app.get('/api/assets/history', isAuthenticated, (req, res) => {
    const months = parseInt(req.query.months) || 12;
    
    console.log('API被调用，months参数:', months);
    
    // 从accessory_asset_snapshots表获取配件总价值数据
    const query = `
        SELECT 
            DATE_FORMAT(snapshot_month, '%Y-%m') AS record_date,
            total_accessory_total_value AS total_value,
            total_accessory_quantity AS total_quantity
        FROM accessory_asset_snapshots 
        ORDER BY snapshot_month DESC
        LIMIT ?
    `;
    
    db.query(query, [months], (err, results) => {
        if (err) {
            console.error('查询资产历史数据失败:', err);
            return res.status(500).json({ success: false });
        }
        
        // 如果没有数据，生成一些示例数据
        if (results.length === 0) {
            console.log('没有快照数据，生成示例数据');
            const today = new Date();
            const sampleData = [];
            
            for (let i = months - 1; i >= 0; i--) {
                const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
                const dateStr = date.toISOString().slice(0, 7); // YYYY-MM
                
                sampleData.push({
                    record_date: dateStr,
                    total_value: Math.floor(Math.random() * 50000) + 200000, // 20万-25万之间的随机值
                    total_quantity: Math.floor(Math.random() * 50) + 100 // 100-150之间的随机值
                });
            }
            
            res.json({
                success: true,
                isSampleData: true, // 标记这是示例数据
                history: sampleData
            });
        } else {
            res.json({
                success: true,
                isSampleData: false, // 标记这是真实数据
                history: results
            });
        }
    });
});

// 临时API用于测试图表数据
app.get('/api/assets/history-test', isAuthenticated, (req, res) => {
    // 返回一些测试数据
    const testData = [
        { record_date: '2024-01', total_value: 300000, total_quantity: 100 },
        { record_date: '2024-02', total_value: 310000, total_quantity: 105 },
        { record_date: '2024-03', total_value: 320000, total_quantity: 110 },
        { record_date: '2024-04', total_value: 330000, total_quantity: 115 },
        { record_date: '2024-05', total_value: 340000, total_quantity: 120 },
        { record_date: '2024-06', total_value: 350000, total_quantity: 125 },
        { record_date: '2024-07', total_value: 360000, total_quantity: 130 },
        { record_date: '2024-08', total_value: 370000, total_quantity: 135 },
        { record_date: '2024-09', total_value: 380000, total_quantity: 140 },
        { record_date: '2024-10', total_value: 390000, total_quantity: 145 },
        { record_date: '2024-11', total_value: 400000, total_quantity: 150 },
        { record_date: '2024-12', total_value: 410000, total_quantity: 155 }
    ];
    
    res.json({
        success: true,
        history: testData
    });
});

// 获取资产快照
app.get('/api/assets/snapshots', isAuthenticated, (req, res) => {
    db.query(`
        SELECT s.*, 
               d.depreciation_amount
        FROM asset_snapshots s
        LEFT JOIN (
            SELECT 
                snapshot_date,
                (total_asset_value - LAG(total_asset_value) OVER (ORDER BY snapshot_date)) AS depreciation_amount
            FROM asset_snapshots
        ) d ON s.snapshot_date = d.snapshot_date
        ORDER BY s.snapshot_date DESC
        LIMIT 24
    `, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false });
        }
        
        res.json({
            success: true,
            snapshots: results
        });
    });
});

// 生成资产快照
app.post('/api/assets/generate-snapshot', isAuthenticated, (req, res) => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // 检查本月是否已有快照
    db.query('SELECT id FROM asset_snapshots WHERE snapshot_date = ?', [startOfMonth], (err, existingSnapshot) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false });
        }
        
        if (existingSnapshot.length > 0) {
            return res.json({ 
                success: false, 
                message: '本月快照已存在' 
            });
        }
        
        // 获取设备数量和价值
        db.query('SELECT COUNT(*) as count, SUM(purchase_price) as total_value FROM devices', (err, equipmentData) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false });
            }
            
            // 获取配件数量和价值
            db.query('SELECT COUNT(*) as count, SUM(stock_quantity * unit_price) as total_value FROM accessories', (err, accessoryData) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ success: false });
                }
                
                const deviceCount = equipmentData[0].count || 0;
                const deviceValue = equipmentData[0].total_value || 0;
                const accessoryCount = accessoryData[0].count || 0;
                const accessoryValue = accessoryData[0].total_value || 0;
                const totalValue = deviceValue + accessoryValue;
                
                // 插入快照记录
                db.query(`
                    INSERT INTO asset_snapshots 
                    (snapshot_date, device_count, device_total_value, accessory_count, accessory_total_value) 
                    VALUES (?, ?, ?, ?, ?)
                `, [startOfMonth, deviceCount, deviceValue, accessoryCount, accessoryValue], (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ success: false });
                    }
                    
                    // 同时更新资产历史记录
                    db.query(`
                        INSERT INTO asset_history 
                        (record_date, total_equipment_value, total_accessory_value, total_asset_value) 
                        VALUES (?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                        total_equipment_value = VALUES(total_equipment_value),
                        total_accessory_value = VALUES(total_accessory_value),
                        total_asset_value = VALUES(total_asset_value)
                    `, [startOfMonth, deviceValue, accessoryValue, totalValue], (err) => {
                        if (err) {
                            console.error(err);
                            // 快照已创建，但历史记录更新失败
                        }
                        
                        res.json({ success: true });
                    });
                });
            });
        });
    });
});

// 生成配件月度资产快照（按照配件批次与报废记录统计）
app.post('/api/assets/accessory-snapshot/generate', isAuthenticated, (req, res) => {
    const today = new Date();
    const snapshotMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const snapshotMonthYear = `${snapshotMonth.getFullYear()}-${String(snapshotMonth.getMonth() + 1).padStart(2, '0')}`;

    // 检查本月是否已有配件资产快照，以便决定是插入还是更新
    db.query(
        'SELECT id FROM accessory_asset_snapshots WHERE snapshot_month = ? LIMIT 1',
        [snapshotMonth],
        (checkErr, existingRows) => {

            // 1) 当月新增配件：按采购批次的配件采购数量与金额
            const newPurchaseSql = `
                SELECT 
                    COALESCE(SUM(pai.quantity), 0) AS new_quantity,
                    COALESCE(SUM(pai.quantity * pai.unit_price), 0) AS new_total_value
                FROM purchase_accessory_items pai
                JOIN purchase_batches pb ON pai.batch_id = pb.id
                WHERE pb.purchase_date >= ? AND pb.purchase_date < ?
            `;

            db.query(newPurchaseSql, [snapshotMonth, nextMonth], (purchaseErr, purchaseRows) => {
                if (purchaseErr) {
                    console.error('统计当月新增配件失败:', purchaseErr);
                    return res.status(500).json({ success: false });
                }

                const newQuantity = parseInt(purchaseRows[0]?.new_quantity || 0, 10);
                const newTotalValue = parseFloat(purchaseRows[0]?.new_total_value || 0);

                // 2) 当月报废配件：按报废记录统计数量与金额
                const scrapSql = `
                    SELECT 
                        COALESCE(SUM(asr.quantity), 0) AS scrapped_quantity,
                        COALESCE(SUM(asr.quantity * COALESCE(asr.purchase_price, 0)), 0) AS scrapped_total_value
                    FROM accessory_scrap_records asr
                    WHERE asr.scrap_date >= ? AND asr.scrap_date < ?
                `;

                db.query(scrapSql, [snapshotMonth, nextMonth], (scrapErr, scrapRows) => {
                    if (scrapErr) {
                        console.error('统计当月报废配件失败:', scrapErr);
                        return res.status(500).json({ success: false });
                    }

                    const scrappedQuantity = parseInt(scrapRows[0]?.scrapped_quantity || 0, 10);
                    const scrappedTotalValue = parseFloat(scrapRows[0]?.scrapped_total_value || 0);

                    // 3) 截至本月底的配件总数与总价值（所有批次采购数量 × 当月最新价格）
                    const totalsSql = `
                        SELECT 
                            COALESCE(SUM(pt.total_quantity), 0) AS total_quantity,
                            COALESCE(SUM(pt.total_quantity * COALESCE(aph.price, a.purchase_price, 0)), 0) AS total_value
                        FROM (
                            SELECT 
                                pai.accessory_id,
                                SUM(pai.quantity) AS total_quantity
                            FROM purchase_accessory_items pai
                            JOIN purchase_batches pb ON pai.batch_id = pb.id
                            WHERE pb.purchase_date < ?
                            GROUP BY pai.accessory_id
                        ) pt
                        JOIN accessories a ON pt.accessory_id = a.id
                        LEFT JOIN (
                            SELECT aph1.*
                            FROM accessory_price_history aph1
                            JOIN (
                                SELECT accessory_id, MAX(month_year) AS max_month_year
                                FROM accessory_price_history
                                WHERE month_year <= ?
                                GROUP BY accessory_id
                            ) latest ON aph1.accessory_id = latest.accessory_id
                                     AND aph1.month_year = latest.max_month_year
                        ) aph ON a.id = aph.accessory_id
                    `;

                    db.query(totalsSql, [nextMonth, snapshotMonthYear], (totalsErr, totalsRows) => {
                        if (totalsErr) {
                            console.error('统计配件总数与总价值失败:', totalsErr);
                            return res.status(500).json({ success: false });
                        }

                        const totalQuantity = parseInt(totalsRows[0]?.total_quantity || 0, 10);
                        const totalValue = parseFloat(totalsRows[0]?.total_value || 0);

                        // 判断是插入还是更新
                        if (existingRows && existingRows.length > 0) {
                            // 更新现有记录
                            db.query(
                                `
                                UPDATE accessory_asset_snapshots SET
                                    new_accessory_quantity = ?,
                                    new_accessory_total_value = ?,
                                    scrapped_accessory_quantity = ?,
                                    scrapped_accessory_total_value = ?,
                                    total_accessory_quantity = ?,
                                    total_accessory_total_value = ?
                                WHERE snapshot_month = ?
                                `,
                                [
                                    newQuantity,
                                    newTotalValue,
                                    scrappedQuantity,
                                    scrappedTotalValue,
                                    totalQuantity,
                                    totalValue,
                                    snapshotMonth
                                ],
                                (updateErr) => {
                                    if (updateErr) {
                                        console.error('更新配件资产快照失败:', updateErr);
                                        return res.status(500).json({ success: false });
                                    }

                                    res.json({
                                        success: true,
                                        message: '本月配件资产快照已更新',
                                        snapshot: {
                                            snapshot_month: snapshotMonth,
                                            new_accessory_quantity: newQuantity,
                                            new_accessory_total_value: newTotalValue,
                                            scrapped_accessory_quantity: scrappedQuantity,
                                            scrapped_accessory_total_value: scrappedTotalValue,
                                            total_accessory_quantity: totalQuantity,
                                            total_accessory_total_value: totalValue
                                        }
                                    });
                                }
                            );
                        } else {
                            // 插入新记录
                            db.query(
                                `
                                INSERT INTO accessory_asset_snapshots (
                                    snapshot_month,
                                    new_accessory_quantity,
                                    new_accessory_total_value,
                                    scrapped_accessory_quantity,
                                    scrapped_accessory_total_value,
                                    total_accessory_quantity,
                                    total_accessory_total_value
                                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                                `,
                                [
                                    snapshotMonth,
                                    newQuantity,
                                    newTotalValue,
                                    scrappedQuantity,
                                    scrappedTotalValue,
                                    totalQuantity,
                                    totalValue
                                ],
                                (insertErr) => {
                                    if (insertErr) {
                                        console.error('插入配件资产快照失败:', insertErr);
                                        return res.status(500).json({ success: false });
                                    }

                                    res.json({
                                        success: true,
                                        message: '本月配件资产快照已生成',
                                        snapshot: {
                                            snapshot_month: snapshotMonth,
                                            new_accessory_quantity: newQuantity,
                                            new_accessory_total_value: newTotalValue,
                                            scrapped_accessory_quantity: scrappedQuantity,
                                            scrapped_accessory_total_value: scrappedTotalValue,
                                            total_accessory_quantity: totalQuantity,
                                            total_accessory_total_value: totalValue
                                        }
                                    });
                                }
                            );
                        }
                    });
                });
            });
        }
    );
});

// 获取当前月份的配件资产快照
app.get('/api/assets/accessory-snapshot/current', isAuthenticated, (req, res) => {
    const today = new Date();
    const snapshotMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    db.query(
        'SELECT * FROM accessory_asset_snapshots WHERE snapshot_month = ? LIMIT 1',
        [snapshotMonth],
        (err, rows) => {
            if (err) {
                console.error('查询当前配件资产快照失败:', err);
                return res.status(500).json({ success: false });
            }

            if (!rows || rows.length === 0) {
                return res.json({
                    success: true,
                    snapshot: null,
                    message: '本月配件资产快照尚未生成'
                });
            }

            res.json({
                success: true,
                snapshot: rows[0]
            });
        }
    );
});

// 获取配件资产快照历史
app.get('/api/assets/accessory-snapshot/history', isAuthenticated, (req, res) => {
    db.query(
        'SELECT * FROM accessory_asset_snapshots ORDER BY snapshot_month DESC',
        (err, rows) => {
            if (err) {
                console.error('查询配件资产快照历史失败:', err);
                return res.status(500).json({ success: false });
            }

            res.json({
                success: true,
                snapshots: rows
            });
        }
    );
});

// 生成历史资产快照（从2023年以来每个月）
app.post('/api/assets/snapshot/generate-history', isAuthenticated, (req, res) => {
    const today = new Date();
    const startYear = 2023;
    const startMonth = 0; // 1月
    const endYear = today.getFullYear();
    const endMonth = today.getMonth(); // 当前月
    
    let generatedCount = 0;
    let errors = [];
    
    // 创建生成单个月快照的函数
    function generateMonthSnapshot(year, month) {
        return new Promise((resolve, reject) => {
            const snapshotDate = new Date(year, month, 1);
            const nextMonth = new Date(year, month + 1, 1);
            
            // 1) 截至该月的设备总数与总价值（累计值）
            const deviceSql = `
                SELECT 
                    COUNT(*) AS device_count,
                    COALESCE(SUM(d.purchase_price), 0) AS device_total_value
                FROM devices d
                WHERE d.created_at < ?
            `;

            db.query(deviceSql, [nextMonth], (deviceErr, deviceRows) => {
                if (deviceErr) {
                    console.error(`统计${year}年${month+1}月设备失败:`, deviceErr);
                    return reject(deviceErr);
                }

                const deviceCount = parseInt(deviceRows[0]?.device_count || 0, 10);
                const deviceTotalValue = parseFloat(deviceRows[0]?.device_total_value || 0);

                // 2) 截至该月的配件总数与总价值（累计值）
                const accessorySql = `
                    SELECT 
                        COUNT(*) AS accessory_count,
                        COALESCE(SUM(pai.quantity * pai.unit_price), 0) AS accessory_total_value
                    FROM purchase_accessory_items pai
                    JOIN purchase_batches pb ON pai.batch_id = pb.id
                    WHERE pb.purchase_date < ?
                `;

                db.query(accessorySql, [nextMonth], (accessoryErr, accessoryRows) => {
                    if (accessoryErr) {
                        console.error(`统计${year}年${month+1}月配件失败:`, accessoryErr);
                        return reject(accessoryErr);
                    }

                    const accessoryCount = parseInt(accessoryRows[0]?.accessory_count || 0, 10);
                    const accessoryTotalValue = parseFloat(accessoryRows[0]?.accessory_total_value || 0);

                    // 判断是插入还是更新
                    db.query(
                        'SELECT id FROM asset_snapshots WHERE snapshot_date = ? LIMIT 1',
                        [snapshotDate],
                        (checkErr, existingRows) => {
                            if (checkErr) {
                                console.error(`检查${year}年${month+1}月资产快照失败:`, checkErr);
                                return reject(checkErr);
                            }

                            if (existingRows && existingRows.length > 0) {
                                // 更新现有记录
                                db.query(
                                    `
                                    UPDATE asset_snapshots SET
                                        device_count = ?,
                                        device_total_value = ?,
                                        accessory_count = ?,
                                        accessory_total_value = ?
                                    WHERE snapshot_date = ?
                                    `,
                                    [
                                        deviceCount,
                                        deviceTotalValue,
                                        accessoryCount,
                                        accessoryTotalValue,
                                        snapshotDate
                                    ],
                                    (updateErr) => {
                                        if (updateErr) {
                                            console.error(`更新${year}年${month+1}月资产快照失败:`, updateErr);
                                            return reject(updateErr);
                                        }
                                        resolve();
                                    }
                                );
                            } else {
                                // 插入新记录
                                db.query(
                                    `
                                    INSERT INTO asset_snapshots (
                                        snapshot_date,
                                        device_count,
                                        device_total_value,
                                        accessory_count,
                                        accessory_total_value
                                    ) VALUES (?, ?, ?, ?, ?)
                                    `,
                                    [
                                        snapshotDate,
                                        deviceCount,
                                        deviceTotalValue,
                                        accessoryCount,
                                        accessoryTotalValue
                                    ],
                                    (insertErr) => {
                                        if (insertErr) {
                                            console.error(`插入${year}年${month+1}月资产快照失败:`, insertErr);
                                            return reject(insertErr);
                                        }
                                        resolve();
                                    }
                                );
                            }
                        }
                    );
                });
            });
        });
    }
    
    // 按顺序生成每个月的快照
    async function generateAllSnapshots() {
        try {
            for (let year = startYear; year <= endYear; year++) {
                const monthStart = (year === startYear) ? startMonth : 0;
                const monthEnd = (year === endYear) ? endMonth : 11;
                
                for (let month = monthStart; month <= monthEnd; month++) {
                    await generateMonthSnapshot(year, month);
                    generatedCount++;
                    console.log(`已生成${year}年${month+1}月快照`);
                }
            }
            
            res.json({
                success: true,
                message: `成功生成${generatedCount}个月的资产快照`,
                count: generatedCount
            });
        } catch (error) {
            console.error('生成历史快照时发生错误:', error);
            res.status(500).json({
                success: false,
                message: '生成历史快照时发生错误',
                error: error.message
            });
        }
    }
    
    generateAllSnapshots();
});

// 生成历史配件资产快照（从2023年以来每个月）
app.post('/api/assets/accessory-snapshot/generate-history', isAuthenticated, (req, res) => {
    const today = new Date();
    const startYear = 2023;
    const startMonth = 0; // 1月
    const endYear = today.getFullYear();
    const endMonth = today.getMonth(); // 当前月
    
    let generatedCount = 0;
    let errors = [];
    
    // 创建生成单个月快照的函数
    function generateMonthSnapshot(year, month) {
        return new Promise((resolve, reject) => {
            const snapshotMonth = new Date(year, month, 1);
            const nextMonth = new Date(year, month + 1, 1);
            const snapshotMonthYear = `${snapshotMonth.getFullYear()}-${String(snapshotMonth.getMonth() + 1).padStart(2, '0')}`;
            
            // 1) 当月新增配件：按采购批次的配件采购数量与金额
            const newPurchaseSql = `
                SELECT 
                    COALESCE(SUM(pai.quantity), 0) AS new_quantity,
                    COALESCE(SUM(pai.quantity * pai.unit_price), 0) AS new_total_value
                FROM purchase_accessory_items pai
                JOIN purchase_batches pb ON pai.batch_id = pb.id
                WHERE pb.purchase_date >= ? AND pb.purchase_date < ?
            `;

            db.query(newPurchaseSql, [snapshotMonth, nextMonth], (purchaseErr, purchaseRows) => {
                if (purchaseErr) {
                    console.error(`统计${year}年${month+1}月新增配件失败:`, purchaseErr);
                    return reject(purchaseErr);
                }

                const newQuantity = parseInt(purchaseRows[0]?.new_quantity || 0, 10);
                const newTotalValue = parseFloat(purchaseRows[0]?.new_total_value || 0);

                // 2) 当月报废配件：按报废记录统计数量与金额
                const scrapSql = `
                    SELECT 
                        COALESCE(SUM(asr.quantity), 0) AS scrapped_quantity,
                        COALESCE(SUM(asr.quantity * COALESCE(asr.purchase_price, 0)), 0) AS scrapped_total_value
                    FROM accessory_scrap_records asr
                    WHERE asr.scrap_date >= ? AND asr.scrap_date < ?
                `;

                db.query(scrapSql, [snapshotMonth, nextMonth], (scrapErr, scrapRows) => {
                    if (scrapErr) {
                        console.error(`统计${year}年${month+1}月报废配件失败:`, scrapErr);
                        return reject(scrapErr);
                    }

                    const scrappedQuantity = parseInt(scrapRows[0]?.scrapped_quantity || 0, 10);
                    const scrappedTotalValue = parseFloat(scrapRows[0]?.scrapped_total_value || 0);

                    // 3) 截至本月底的配件总数与总价值
                    const totalsSql = `
                        SELECT 
                            COALESCE(SUM(pt.total_quantity), 0) AS total_quantity,
                            COALESCE(SUM(pt.total_quantity * COALESCE(aph.price, a.purchase_price, 0)), 0) AS total_value
                        FROM (
                            SELECT 
                                pai.accessory_id,
                                SUM(pai.quantity) AS total_quantity
                            FROM purchase_accessory_items pai
                            JOIN purchase_batches pb ON pai.batch_id = pb.id
                            WHERE pb.purchase_date < ?
                            GROUP BY pai.accessory_id
                        ) pt
                        JOIN accessories a ON pt.accessory_id = a.id
                        LEFT JOIN (
                            SELECT aph1.*
                            FROM accessory_price_history aph1
                            JOIN (
                                SELECT accessory_id, MAX(month_year) AS max_month_year
                                FROM accessory_price_history
                                WHERE month_year <= ?
                                GROUP BY accessory_id
                            ) latest ON aph1.accessory_id = latest.accessory_id
                                         AND aph1.month_year = latest.max_month_year
                        ) aph ON a.id = aph.accessory_id
                    `;

                    db.query(totalsSql, [nextMonth, snapshotMonthYear], (totalsErr, totalsRows) => {
                        if (totalsErr) {
                            console.error(`统计${year}年${month+1}月配件总数与总价值失败:`, totalsErr);
                            return reject(totalsErr);
                        }

                        const totalQuantity = parseInt(totalsRows[0]?.total_quantity || 0, 10);
                        const totalValue = parseFloat(totalsRows[0]?.total_value || 0);

                        // 判断是插入还是更新
                        db.query(
                            'SELECT id FROM accessory_asset_snapshots WHERE snapshot_month = ? LIMIT 1',
                            [snapshotMonth],
                            (checkErr, existingRows) => {
                                if (checkErr) {
                                    console.error(`检查${year}年${month+1}月配件资产快照失败:`, checkErr);
                                    return reject(checkErr);
                                }

                                if (existingRows && existingRows.length > 0) {
                                    // 更新现有记录
                                    db.query(
                                        `
                                        UPDATE accessory_asset_snapshots SET
                                            new_accessory_quantity = ?,
                                            new_accessory_total_value = ?,
                                            scrapped_accessory_quantity = ?,
                                            scrapped_accessory_total_value = ?,
                                            total_accessory_quantity = ?,
                                            total_accessory_total_value = ?
                                        WHERE snapshot_month = ?
                                        `,
                                        [
                                            newQuantity,
                                            newTotalValue,
                                            scrappedQuantity,
                                            scrappedTotalValue,
                                            totalQuantity,
                                            totalValue,
                                            snapshotMonth
                                        ],
                                        (updateErr) => {
                                            if (updateErr) {
                                                console.error(`更新${year}年${month+1}月配件资产快照失败:`, updateErr);
                                                return reject(updateErr);
                                            }
                                            resolve();
                                        }
                                    );
                                } else {
                                    // 插入新记录
                                    db.query(
                                        `
                                        INSERT INTO accessory_asset_snapshots (
                                            snapshot_month,
                                            new_accessory_quantity,
                                            new_accessory_total_value,
                                            scrapped_accessory_quantity,
                                            scrapped_accessory_total_value,
                                            total_accessory_quantity,
                                            total_accessory_total_value
                                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                                        `,
                                        [
                                            snapshotMonth,
                                            newQuantity,
                                            newTotalValue,
                                            scrappedQuantity,
                                            scrappedTotalValue,
                                            totalQuantity,
                                            totalValue
                                        ],
                                        (insertErr) => {
                                            if (insertErr) {
                                                console.error(`插入${year}年${month+1}月配件资产快照失败:`, insertErr);
                                                return reject(insertErr);
                                            }
                                            resolve();
                                        }
                                    );
                                }
                            }
                        );
                    });
                });
            });
        });
    }
    
    // 逐月生成快照
    async function generateAllSnapshots() {
        for (let year = startYear; year <= endYear; year++) {
            const monthStart = (year === startYear) ? startMonth : 0;
            const monthEnd = (year === endYear) ? endMonth : 11;
            
            for (let month = monthStart; month <= monthEnd; month++) {
                try {
                    await generateMonthSnapshot(year, month);
                    generatedCount++;
                } catch (err) {
                    errors.push(`${year}年${month+1}月: ${err.message}`);
                }
            }
        }
    }
    
    // 执行生成
    generateAllSnapshots().then(() => {
        res.json({
            success: true,
            message: `历史快照生成完成，共生成/更新了 ${generatedCount} 个月的快照`,
            count: generatedCount,
            errors: errors.length > 0 ? errors : undefined
        });
    }).catch((err) => {
        console.error('生成历史快照时发生错误:', err);
        res.status(500).json({
            success: false,
            message: '生成历史快照时发生错误',
            error: err.message
        });
    });
});

// 获取实时配件数量（与配件库存统计一致）
app.get('/api/assets/accessory-quantity/realtime', isAuthenticated, (req, res) => {
    const query = `
        SELECT SUM(abs.quantity) AS totalCount, SUM(abs.available_quantity) AS stockCount
        FROM accessory_batch_stock abs
        JOIN accessories a ON abs.accessory_id = a.id
        WHERE a.status != 'scrapped'
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('查询配件实时数量失败:', err);
            return res.status(500).json({ success: false, message: '查询失败' });
        }
        
        const totalCount = results[0]?.totalCount || 0;
        const stockCount = results[0]?.stockCount || 0;
        
        res.json({
            success: true,
            totalCount: totalCount,
            stockCount: stockCount
        });
    });
});

// 设备管理路由

// 设备列表页面
app.get('/devices', isAuthenticated, (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const productCode = req.query.productCode || '';
    
    // 构建查询条件
    let whereConditions = [];
    let queryParams = [];
    
    if (search) {
        whereConditions.push('(d.device_code LIKE ? OR d.device_name LIKE ? OR p.model_number LIKE ?)');
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (status) {
        whereConditions.push('d.status = ?');
        queryParams.push(status);
    }
    
    if (productCode) {
        whereConditions.push('(d.product_id = ? OR p.product_code = ?)');
        queryParams.push(productCode, productCode);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // 查询设备列表
    const query = `
        SELECT d.*, 
               p.name as product_name,
               p.model_number as product_specifications
        FROM devices d
        LEFT JOIN products p ON d.product_id = p.id
        ${whereClause}
        ORDER BY
            CASE
                WHEN d.status = 'in_warehouse' THEN 1
                WHEN d.status = 'available' THEN 2
                ELSE 3
            END,
            d.created_at DESC
        LIMIT ? OFFSET ?
    `;
    
    queryParams.push(limit, offset);
    
    db.query(query, queryParams, (err, devices) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 获取总数（保持与列表查询相同的 JOIN，以支持按产品型号搜索）
        const countQuery = `
            SELECT COUNT(*) as total
            FROM devices d
            LEFT JOIN products p ON d.product_id = p.id
            ${whereClause}
        `;
        
        const countParams = queryParams.slice(0, -2);
        
        db.query(countQuery, countParams, (err, countResult) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            const totalItems = countResult[0].total;
            const totalPages = Math.ceil(totalItems / limit);
            
            // 获取所有产品型号用于筛选
            db.query(`
                SELECT d.product_code, 
                       COUNT(*) as count,
                       MAX(p.model_number) as specifications
                FROM devices d
                LEFT JOIN products p ON d.product_code = p.product_code
                WHERE d.product_code IS NOT NULL 
                GROUP BY d.product_code 
                ORDER BY d.product_code
            `, (err, productCodes) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器错误');
                }
                
                res.render('devices/index', {
                    devices: devices,
                    currentPage: page,
                    totalPages: totalPages,
                    totalItems: totalItems,
                    productCodes: productCodes,
                    user: req.session.user,
                    moment: moment,
                    active: 'devices',
                    pageTitle: '设备管理'
                });
            });
        });
    });
});

// 设备组装页面
app.get('/devices/assemble', isAuthenticated, (req, res) => {
    // 获取产品列表和设备模板
    db.query('SELECT * FROM products ORDER BY name', (err, products) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 获取设备模板
        db.query(`
            SELECT dt.*, ac.name as category_name
            FROM device_templates dt
            LEFT JOIN accessory_categories ac ON dt.accessory_category_id = ac.id
            ORDER BY dt.product_code, dt.accessory_category_id
        `, (err, templates) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            // 获取可用的配件
            db.query(`
                SELECT a.*, ac.name as category_name
                FROM accessories a
                LEFT JOIN accessory_categories ac ON a.category_id = ac.id
                WHERE a.stock_quantity > 0
                ORDER BY a.category_id, a.brand, a.model
            `, (err, accessories) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器错误');
                }
                
                res.render('devices/assemble', {
                    products: products,
                    templates: templates,
                    accessories: accessories,
                    user: req.session.user,
                    moment: moment,
                    active: 'devices',
                    pageTitle: '设备组装'
                });
            });
        });
    });
});

// 获取产品模板和配件
app.get('/api/device-templates/:productCode', isAuthenticated, (req, res) => {
    const productCode = req.params.productCode;
    
    db.query(`
        SELECT dt.*, ac.name as category_name
        FROM device_templates dt
        LEFT JOIN accessory_categories ac ON dt.accessory_category_id = ac.id
        WHERE dt.product_code = ?
        ORDER BY dt.accessory_category_id
    `, [productCode], (err, templates) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
        
        // 获取对应类别的可用配件
        const categoryIds = templates.map(t => t.accessory_category_id);
        
        if (categoryIds.length === 0) {
            return res.json({ success: true, templates: [], accessories: [] });
        }
        
        db.query(`
            SELECT a.*, ac.name as category_name
            FROM accessories a
            LEFT JOIN accessory_categories ac ON a.category_id = ac.id
            WHERE a.category_id IN (?) AND a.stock_quantity > 0
            ORDER BY a.category_id, a.brand, a.model
        `, [categoryIds], (err, accessories) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: '服务器错误' });
            }
            
            res.json({ 
                success: true, 
                templates: templates,
                accessories: accessories
            });
        });
    });
});

// API: 获取所有配件列表
app.get('/api/accessories', isAuthenticated, (req, res) => {
    const { categoryIds } = req.query;
    let query = `
        SELECT a.*, ac.name as category_name
        FROM accessories a
        LEFT JOIN accessory_categories ac ON a.category_id = ac.id
    `;
    let params = [];
    
    if (categoryIds) {
        const ids = categoryIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        if (ids.length > 0) {
            query += ' WHERE a.category_id IN (?)';
            params.push(ids);
        }
    }
    
    query += ' ORDER BY a.category_id, a.brand, a.model';
    
    db.query(query, params, (err, accessories) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
        
        res.json({
            success: true,
            accessories: accessories
        });
    });
});

// 获取配件总数（基于批次库存数据）
app.get('/api/accessories/total-count', isAuthenticated, (req, res) => {
    const query = `
        SELECT SUM(abs.quantity) AS totalCount, SUM(abs.available_quantity) AS stockCount
        FROM accessory_batch_stock abs
        JOIN accessories a ON abs.accessory_id = a.id
        WHERE a.status != 'scrapped'
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('查询配件总数失败:', err);
            return res.status(500).json({ success: false, message: '查询失败' });
        }
        
        const totalCount = results[0]?.totalCount || 0;
        const stockCount = results[0]?.stockCount || 0;
        
        res.json({
            success: true,
            totalCount: totalCount,
            stockCount: stockCount
        });
    });
});

// API: 获取下一个可用的采购批次号
app.get('/api/next-batch-no', isAuthenticated, (req, res) => {
    const today = moment().format('YYYYMMDD');
    const prefix = `PO${today}`;
    
    // 查询今天最大的批次号
    db.query(`
        SELECT batch_no 
        FROM purchase_batches 
        WHERE batch_no LIKE ?
        ORDER BY batch_no DESC 
        LIMIT 1
    `, [`${prefix}%`], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '查询批次号失败' });
        }
        
        let nextBatchNo;
        if (results.length === 0) {
            // 如果今天还没有批次号，从001开始
            nextBatchNo = `${prefix}001`;
        } else {
            // 获取当前最大的序号并加1
            const currentBatchNo = results[0].batch_no;
            const currentSequence = parseInt(currentBatchNo.substring(prefix.length)) || 0;
            const nextSequence = currentSequence + 1;
            // 格式化为3位数字，不足补0
            nextBatchNo = `${prefix}${nextSequence.toString().padStart(3, '0')}`;
        }
        
        res.json({
            success: true,
            batchNo: nextBatchNo
        });
    });
});

// API: 获取所有产品列表
app.get('/api/products', isAuthenticated, (req, res) => {
    const query = `
        SELECT p.*, pc.name as category_name
        FROM products p
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        ORDER BY p.category_id, p.brand, p.model
    `;
    
    db.query(query, (err, products) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
        
        res.json({
            success: true,
            products: products
        });
    });
});

// 执行设备组装 - 使用批次跟踪系统（批次跟踪版，暂改用独立路径）
app.post('/devices/assemble-batch', isAuthenticated, (req, res) => {
    const { productId, quantity } = req.body;
    
    console.log('收到组装请求:', { productId, quantity });
    
    if (!productId || !quantity) {
        return res.status(400).json({ success: false, message: '参数不完整：缺少产品ID或数量' });
    }
    
    const assembleQuantity = parseInt(quantity);
    if (assembleQuantity <= 0) {
        return res.status(400).json({ success: false, message: '数量必须大于0' });
    }
    
    // 获取产品信息
    db.query('SELECT * FROM products WHERE id = ?', [productId], (err, products) => {
        if (err) {
            console.error('查询产品错误:', err);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
        
        if (products.length === 0) {
            return res.status(400).json({ success: false, message: '产品不存在' });
        }
        
        const product = products[0];
        const productCode = product.product_code || product.code;
        
        console.log('找到产品:', product.name, '编码:', productCode);
        
        // 如果产品没有编码或未维护模板，则禁止组装
        if (!productCode) {
            console.log('产品无编码，禁止组装');
            return res.status(400).json({ 
                success: false, 
                message: '该产品没有产品编号或配件模板，不能组装电脑。请先在产品管理中生成产品型号并配置配件。' 
            });
        }
        
        // 从device_templates获取该产品的配件清单
        db.query(`
            SELECT dt.*, a.name as accessory_name, a.brand, a.model, a.id as accessory_id
            FROM device_templates dt
            LEFT JOIN accessories a ON 
                a.category_id = dt.accessory_category_id AND
                a.brand = dt.brand AND
                a.model = dt.model
            WHERE dt.product_code = ?
            ORDER BY dt.accessory_category_id
        `, [productCode], (err, templateAccessories) => {
            if (err) {
                console.error('查询配件模板错误:', err);
                return res.status(500).json({ success: false, message: '查询配件模板失败' });
            }
            
            console.log('查询到的模板配件数量:', templateAccessories.length);
            console.log('模板配件详情:', JSON.stringify(templateAccessories.slice(0, 3), null, 2));
            
            if (templateAccessories.length === 0) {
                console.log('无配件模板，禁止组装');
                return res.status(400).json({ 
                    success: false, 
                    message: '该产品未维护配件模板，不能组装电脑。请在产品管理中配置配件并同步模板后再试。' 
                });
            }

            // 对模板配件按 accessory_id（或类别+品牌+型号）去重，避免同一部件被重复处理
            const templateAccessoryMap = new Map();
            templateAccessories.forEach(item => {
                const keyBrand = item.brand || '';
                const keyModel = item.model || '';
                const key = item.accessory_id
                    ? `id:${item.accessory_id}`
                    : `tmpl:${item.accessory_category_id}:${keyBrand}:${keyModel}`;
                if (!templateAccessoryMap.has(key)) {
                    templateAccessoryMap.set(key, item);
                }
            });
            const uniqueTemplateAccessories = Array.from(templateAccessoryMap.values());
            console.log('去重后的模板配件数量:', uniqueTemplateAccessories.length);

            // 前端传入的配件数量配置
            const clientAccessories = Array.isArray(req.body.accessories) ? req.body.accessories : [];
            const clientQuantityMap = new Map();
            
            for (const item of clientAccessories) {
                const accessoryId = parseInt(item.accessoryId || item.accessory_id, 10);
                const perDeviceQuantity = parseInt(item.quantity, 10);
                if (!accessoryId || !perDeviceQuantity || perDeviceQuantity <= 0) {
                    continue;
                }
                clientQuantityMap.set(accessoryId, perDeviceQuantity);
            }

            if (clientQuantityMap.size === 0) {
                console.log('前端未提供有效的配件数量配置，禁止组装');
                return res.status(400).json({ 
                    success: false, 
                    message: '未提供配件数量配置，不能组装电脑。请在产品配置详情中为每个部件设置数量。' 
                });
            }
            
            // 检查是否是电脑主机产品（使用 products.is_host 标记）
            if (!product.is_host) {
                console.log('产品未标记为电脑主机，禁止使用批次组装');
                return res.status(400).json({
                    success: false,
                    message: '该产品未标记为电脑主机，不能使用设备组装页面，请在产品管理中设置为电脑主机后再试。'
                });
            }
            
            // 开始事务
            db.beginTransaction(err => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ success: false, message: '事务启动失败' });
                }
                
                // 1. 检查所有配件的库存是否足够
                let checkCompleted = 0;
                const insufficientStock = [];
                const validAccessories = [];
                
                uniqueTemplateAccessories.forEach(templateItem => {
                    // 从前端配置中获取每台设备需要的数量
                    const perDeviceQuantity = clientQuantityMap.get(templateItem.accessory_id);
                    if (!perDeviceQuantity || perDeviceQuantity <= 0) {
                        insufficientStock.push(`${templateItem.accessory_name} - 未提供数量或数量无效`);
                        checkCompleted++;
                        return;
                    }
                    
                    // 查询该配件的总可用库存（所有批次的可用数量总和，包括in_stock和in_use状态）
                    db.query(`
                        SELECT SUM(available_quantity) as total_available
                        FROM accessory_batch_stock
                        WHERE accessory_id = ? AND status IN ('in_stock', 'in_use')
                    `, [templateItem.accessory_id], (err, result) => {
                        if (err) {
                            return db.rollback(() => {
                                if (res.headersSent) return;
                                res.status(500).json({ success: false, message: '检查配件库存失败' });
                            });
                        }
                        
                        const totalAvailable = (result[0] && result[0].total_available) || 0;
                        const requiredQuantity = perDeviceQuantity * assembleQuantity;
                        
                        if (totalAvailable < requiredQuantity) {
                            insufficientStock.push(`${templateItem.accessory_name} (${templateItem.brand} ${templateItem.model}) - 需要: ${requiredQuantity}, 可用: ${totalAvailable}`);
                        } else {
                            validAccessories.push({
                                accessoryId: templateItem.accessory_id,
                                accessoryName: templateItem.accessory_name,
                                brand: templateItem.brand,
                                model: templateItem.model,
                                quantity: perDeviceQuantity
                            });
                        }
                        
                        checkCompleted++;
                        if (checkCompleted === uniqueTemplateAccessories.length) {
                            if (insufficientStock.length > 0) {
                                return db.rollback(() => {
                                    if (res.headersSent) return;
                                    res.status(400).json({ 
                                        success: false, 
                                        message: '以下配件库存不足：' + insufficientStock.join(', ') 
                                    });
                                });
                            }
                            
                            // 所有配件库存足够，开始创建设备
                            createDevicesWithAccessories(product, assembleQuantity, validAccessories, res, db);
                        }
                    });
                });
            });
        });
    });
});

// 创建带配件的设备（使用批次跟踪系统）
function createDevicesWithAccessories(product, quantity, accessories, res, db) {
    // 获取当前产品的最大设备编号
    db.query(`
        SELECT device_code
        FROM devices
        WHERE product_code = ?
        ORDER BY device_code DESC
        LIMIT 1
    `, [product.product_code || product.code], (err, maxDeviceResult) => {
        if (err) {
            console.error('查询设备编号错误:', err);
            return db.rollback(() => {
                if (res.headersSent) return;
                res.status(500).json({ success: false, message: '查询设备编号失败: ' + err.message });
            });
        }
        
        let nextDeviceSeq = 1;
        if (maxDeviceResult && maxDeviceResult.length > 0) {
            const maxDeviceCode = maxDeviceResult[0].device_code || '';
            const parts = maxDeviceCode.split('-');
            if (parts.length > 1) {
                const currentSeq = parseInt(parts[1], 10);
                if (!Number.isNaN(currentSeq)) {
                    nextDeviceSeq = currentSeq + 1;
                }
            }
        }
        
        const devices = [];
        for (let i = 0; i < quantity; i++) {
            const deviceSeq = nextDeviceSeq + i;
            const deviceCode = `${product.product_code || product.code}-${deviceSeq.toString().padStart(3, '0')}`;
            devices.push({
                code: deviceCode,
                product_id: product.id,
                product_code: product.product_code || product.code,
                device_name: product.name,
                status: 'in_warehouse'
            });
        }
        
        // 先插入所有设备记录
        let deviceInserted = 0;
        const deviceIds = [];
        
        devices.forEach((device, index) => {
            db.query(`
                INSERT INTO devices (
                    device_code, product_id, product_code, device_name, 
                    status, assembly_date, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'in_warehouse', NOW(), NOW(), NOW())
            `, [device.code, device.product_id, device.product_code, device.device_name], (err, result) => {
                if (err) {
                    return db.rollback(() => {
                        if (res.headersSent) return;
                        res.status(500).json({ success: false, message: '创建设备记录失败' });
                    });
                }
                
                deviceIds[index] = result.insertId;
                deviceInserted++;
                
                if (deviceInserted === devices.length) {
                    // 所有设备创建完成，开始分配配件
                    let devicesCompleted = 0;
                    
                    devices.forEach((device, deviceIndex) => {
                        const deviceId = deviceIds[deviceIndex];
                        let accessoriesCompleted = 0;
                        
                        // 为每台设备分配配件
                        accessories.forEach(acc => {
                            const { accessoryId, quantity: accQuantity } = acc;
                            
                            // 调用存储过程分配批次（先进先出）
                            db.query(`CALL allocate_accessory_batches(?, ?, ?)`, 
                            [deviceId, accessoryId, accQuantity], (err, result) => {
                                if (err) {
                                    console.error('分配批次失败:', err);
                                    return db.rollback(() => {
                                        if (res.headersSent) return;
                                        res.status(500).json({ success: false, message: '分配配件批次失败' });
                                    });
                                }
                                
                                // 存储过程返回结果在第一个结果集中
                                const allocationResult = result[0] && result[0][0];
                                const allocated = allocationResult ? (allocationResult.allocated_quantity || 0) : 0;
                                
                                if (allocated < accQuantity) {
                                    return db.rollback(() => {
                                        if (res.headersSent) return;
                                        res.status(400).json({ 
                                            success: false, 
                                            message: `配件 ${accessoryId} 分配失败：需要 ${accQuantity} 个，只分配到 ${allocated} 个` 
                                        });
                                    });
                                }
                                
                                accessoriesCompleted++;
                                if (accessoriesCompleted === accessories.length) {
                                    devicesCompleted++;
                                    if (devicesCompleted === devices.length) {
                                        // 所有设备和配件都分配完成，提交事务
                                        db.commit(err => {
                                            if (err) {
                                                return db.rollback(() => {
                                                    if (res.headersSent) return;
                                                    res.status(500).json({ success: false, message: '事务提交失败' });
                                                });
                                            }
                                            
                                            // 添加设备ID到设备对象
                                            devices.forEach((device, index) => {
                                                device.id = deviceIds[index];
                                            });
                                            
                                            if (res.headersSent) return;
                                            res.json({
                                                success: true,
                                                message: `成功组装 ${quantity} 台设备`,
                                                devices: devices
                                            });
                                        });
                                    }
                                }
                            });
                        });
                    });
                }
            });
        });
    });
}app.post('/devices/assemble', isAuthenticated, (req, res) => {
    const { productId, quantity } = req.body;
    
    console.log('收到组装请求:', { productId, quantity });
    
    if (!productId || !quantity) {
        return res.status(400).json({ success: false, message: '参数不完整：缺少产品ID或数量' });
    }
    
    const assembleQuantity = parseInt(quantity);
    if (assembleQuantity <= 0) {
        return res.status(400).json({ success: false, message: '数量必须大于0' });
    }
    
    // 获取产品信息
    db.query('SELECT * FROM products WHERE id = ?', [productId], (err, products) => {
        if (err) {
            console.error('查询产品错误:', err);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
        
        if (products.length === 0) {
            return res.status(400).json({ success: false, message: '产品不存在' });
        }
        
        const product = products[0];
        const productCode = product.product_code || product.code;
        
        console.log('找到产品:', product.name, '编码:', productCode);
        
        // 如果产品没有编码或未维护模板，则禁止组装
        if (!productCode) {
            console.log('产品无编码，禁止组装');
            return res.status(400).json({ 
                success: false, 
                message: '该产品没有产品编号或配件模板，不能组装电脑。请先在产品管理中生成产品型号并配置配件。' 
            });
        }
        
        // 从device_templates获取该产品的配件清单
        db.query(`
            SELECT dt.*, a.name as accessory_name, a.stock_quantity, a.brand, a.model, a.id as accessory_id
            FROM device_templates dt
            LEFT JOIN accessories a ON 
                a.category_id = dt.accessory_category_id AND
                a.brand = dt.brand AND
                a.model = dt.model
            WHERE dt.product_code = ?
            ORDER BY dt.accessory_category_id
        `, [productCode], (err, templateAccessories) => {
            if (err) {
                console.error('查询配件模板错误:', err);
                return res.status(500).json({ success: false, message: '查询配件模板失败' });
            }
            
            console.log('查询到的模板配件数量:', templateAccessories.length);
            console.log('模板配件详情:', JSON.stringify(templateAccessories.slice(0, 3), null, 2));
            
            if (templateAccessories.length === 0) {
                console.log('无配件模板，禁止组装');
                return res.status(400).json({ 
                    success: false, 
                    message: '该产品未维护配件模板，不能组装电脑。请在产品管理中配置配件并同步模板后再试。' 
                });
            }

            // 对模板配件按 accessory_id（或类别+品牌+型号）去重，避免同一部件被重复处理
            const templateAccessoryMap = new Map();
            templateAccessories.forEach(item => {
                const keyBrand = item.brand || '';
                const keyModel = item.model || '';
                const key = item.accessory_id
                    ? `id:${item.accessory_id}`
                    : `tmpl:${item.accessory_category_id}:${keyBrand}:${keyModel}`;
                if (!templateAccessoryMap.has(key)) {
                    templateAccessoryMap.set(key, item);
                }
            });
            const uniqueTemplateAccessories = Array.from(templateAccessoryMap.values());
            console.log('去重后的模板配件数量:', uniqueTemplateAccessories.length);

            // 前端传入的配件数量配置
            const clientAccessories = Array.isArray(req.body.accessories) ? req.body.accessories : [];
            const clientQuantityMap = new Map();
            
            for (const item of clientAccessories) {
                const accessoryId = parseInt(item.accessoryId || item.accessory_id, 10);
                const perDeviceQuantity = parseInt(item.quantity, 10);
                if (!accessoryId || !perDeviceQuantity || perDeviceQuantity <= 0) {
                    continue;
                }
                clientQuantityMap.set(accessoryId, perDeviceQuantity);
            }

            if (clientQuantityMap.size === 0) {
                console.log('前端未提供有效的配件数量配置，禁止组装');
                return res.status(400).json({ 
                    success: false, 
                    message: '未提供配件数量配置，不能组装电脑。请在产品配置详情中为每个部件设置数量。' 
                });
            }
            
            // 筛选库存充足的配件
            const selectedAccessories = [];
            const insufficientItems = [];
            
            console.log('开始检查配件库存...');
            
            // 检查每个模板配件（使用去重后的列表）
            for (const item of uniqueTemplateAccessories) {
                console.log(`检查配件: ${item.accessory_name} - ${item.brand} ${item.model}`);
                
                // 检查是否找到匹配的配件
                if (!item.accessory_id) {
                    insufficientItems.push(`${item.accessory_name} (${item.brand} ${item.model}) - 配件不存在`);
                    console.log(`  ✗ 配件不存在`);
                    continue;
                }

                // 从前端配置中获取每台设备需要的数量
                const perDeviceQuantity = clientQuantityMap.get(item.accessory_id);
                if (!perDeviceQuantity || perDeviceQuantity <= 0) {
                    insufficientItems.push(`${item.accessory_name} (${item.brand} ${item.model}) - 未提供数量或数量无效`);
                    console.log(`  ✗ 未提供数量或数量无效`);
                    continue;
                }
                
                // 检查库存是否充足
                const requiredQuantity = perDeviceQuantity * assembleQuantity;
                if (!item.stock_quantity || item.stock_quantity < requiredQuantity) {
                    insufficientItems.push(`${item.accessory_name} (${item.brand} ${item.model}) - 需要${requiredQuantity}，库存${item.stock_quantity || 0}`);
                    console.log(`  ✗ 库存不足: 需要${requiredQuantity}，库存${item.stock_quantity || 0}`);
                    continue;
                }
                
                console.log(`  ✓ 库存充足: ${item.stock_quantity}`);
                
                selectedAccessories.push({
                    accessoryId: item.accessory_id,
                    accessoryName: item.accessory_name,
                    brand: item.brand,
                    model: item.model,
                    quantity: perDeviceQuantity
                });
            }
            
            if (insufficientItems.length > 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: `配件库存不足或不存在:\n${insufficientItems.join('\n')}` 
                });
            }
            
            if (selectedAccessories.length === 0) {
                console.log('未找到可用配件，禁止组装');
                return res.status(400).json({ 
                    success: false, 
                    message: '未找到任何可用配件，请检查配件数量设置和库存情况。' 
                });
            }
            
            console.log('选中的配件:', selectedAccessories);
            
            // 获取当前产品的最大设备编号（形如 PC0001-001）
            db.query(`
                SELECT device_code
                FROM devices
                WHERE product_code = ?
                ORDER BY device_code DESC
                LIMIT 1
            `, [productCode], (err, maxDeviceResult) => {
                if (err) {
                    console.error('查询设备编号错误:', err);
                    return res.status(500).json({ success: false, message: '查询设备编号失败: ' + err.message });
                }
                
                console.log('查询到的当前产品最大设备编号结果:', maxDeviceResult);
                
                let nextDeviceSeq = 1;
                if (maxDeviceResult && maxDeviceResult.length > 0) {
                    const maxDeviceCode = maxDeviceResult[0].device_code || '';
                    console.log('当前产品最大设备编号:', maxDeviceCode);
                    const parts = maxDeviceCode.split('-');
                    if (parts.length > 1) {
                        const currentSeq = parseInt(parts[1], 10);
                        if (!Number.isNaN(currentSeq)) {
                            nextDeviceSeq = currentSeq + 1;
                        }
                    }
                } else {
                    console.log('该产品还没有任何设备，从 001 开始');
                }
                
                console.log('有配件组装 - 下一个设备流水号:', nextDeviceSeq);
                console.log(`将为产品 ${productCode} 创建设备编号: ${productCode}-${String(nextDeviceSeq).padStart(3, '0')} 到 ${productCode}-${String(nextDeviceSeq + assembleQuantity - 1).padStart(3, '0')}`);
                
                // 开始事务
                db.beginTransaction((err) => {
                    if (err) {
                        console.error('事务开启失败:', err);
                        return res.status(500).json({ success: false, message: '事务开启失败' });
                    }
                    
                    const assembledDevices = [];
                    
                    // 批量创建设备
                    const createDevices = () => {
                        return new Promise((resolve, reject) => {
                            const devicePromises = [];
                            
                            for (let i = 0; i < assembleQuantity; i++) {
                                const deviceSeq = nextDeviceSeq + i;
                                const deviceCode = `${productCode}-${deviceSeq.toString().padStart(3, '0')}`;
                                
                                console.log(`创建设备 ${i + 1}/${assembleQuantity}: ${deviceCode}`);
                                
                                const promise = new Promise((res, rej) => {
                                    db.query(`
                                        INSERT INTO devices (
                                            device_code, product_id, product_code, device_name, 
                                            status, assembly_date, created_at, updated_at
                                        ) VALUES (?, ?, ?, ?, 'in_warehouse', NOW(), NOW(), NOW())
                                    `, [deviceCode, product.id, productCode, product.name], (err, result) => {
                                        if (err) {
                                            console.error(`创建设备 ${deviceCode} 失败:`, err.message);
                                            return rej(err);
                                        }
                                        
                                        const deviceId = result.insertId;
                                        console.log(`✓ 设备 ${deviceCode} 创建成功，ID: ${deviceId}`);
                                        
                                        assembledDevices.push({
                                            id: deviceId,
                                            code: deviceCode,
                                            number: deviceSeq
                                        });
                                        
                                        console.log(`开始为设备 ${deviceCode} 创建组装记录，配件数量: ${selectedAccessories.length}`);
                                        
                                        // 创建设备组装记录
                                        const assemblyPromises = [];
                                        
                                        for (const selected of selectedAccessories) {
                                            const assemblyPromise = new Promise((asmRes, asmRej) => {
                                                console.log(`  - 插入配件: ${selected.accessoryName} (ID: ${selected.accessoryId})`);
                                                db.query(`
                                                    INSERT INTO device_assemblies (
                                                        device_id, accessory_id, accessory_name, 
                                                        brand, model, quantity, created_at
                                                    ) VALUES (?, ?, ?, ?, ?, ?, NOW())
                                                `, [
                                                    deviceId, 
                                                    selected.accessoryId, 
                                                    selected.accessoryName,
                                                    selected.brand,
                                                    selected.model,
                                                    selected.quantity || 1
                                                ], (err) => {
                                                    if (err) {
                                                        console.error(`    插入配件 ${selected.accessoryName} 失败:`, err.message);
                                                        return asmRej(err);
                                                    }
                                                    console.log(`    ✓ 配件 ${selected.accessoryName} 插入成功`);
                                                    asmRes();
                                                });
                                            });
                                            
                                            assemblyPromises.push(assemblyPromise);
                                        }
                                        
                                        Promise.all(assemblyPromises)
                                            .then(() => {
                                                console.log(`✓ 设备 ${deviceCode} 的所有组装记录创建完成`);
                                                res();
                                            })
                                            .catch(err => {
                                                console.error(`设备 ${deviceCode} 组装记录创建失败:`, err.message);
                                                rej(err);
                                            });
                                    });
                                });
                                
                                devicePromises.push(promise);
                            }
                            
                            Promise.all(devicePromises)
                                .then(() => resolve())
                                .catch(err => reject(err));
                        });
                    };
                    
                    // 批量更新配件库存
                    const updateAccessoryStock = () => {
                        return new Promise((resolve, reject) => {
                            console.log('开始更新配件库存，配件数量:', selectedAccessories.length);
                            console.log('配件详情:', JSON.stringify(selectedAccessories, null, 2));
                            
                            const updatePromises = [];
                            
                            for (const selected of selectedAccessories) {
                                const promise = new Promise((res, rej) => {
                                    const reduction = (selected.quantity || 1) * assembleQuantity;
                                    
                                    console.log(`准备扣减配件: ${selected.accessoryName} (ID: ${selected.accessoryId}), 扣减数量: ${reduction}`);
                                    
                                    db.query(`
                                        UPDATE accessories
                                        SET stock_quantity = stock_quantity - ?,
                                            status = CASE 
                                                WHEN stock_quantity - ? = 0 THEN 'assembled'
                                                WHEN stock_quantity - ? > 0 THEN 'in_warehouse'
                                                ELSE status
                                            END,
                                            updated_at = NOW()
                                        WHERE id = ?
                                    `, [reduction, reduction, reduction, selected.accessoryId], (err, result) => {
                                        if (err) {
                                            console.error(`扣减配件 ${selected.accessoryName} 失败:`, err.message);
                                            return rej(err);
                                        }
                                        console.log(`✓ 配件 ${selected.accessoryName} 库存扣减成功，影响行数: ${result.affectedRows}`);
                                        res();
                                    });
                                });
                                
                                updatePromises.push(promise);
                            }
                            
                            Promise.all(updatePromises)
                                .then(() => {
                                    console.log('所有配件库存更新Promise完成');
                                    resolve();
                                })
                                .catch(err => {
                                    console.error('配件库存更新Promise出错:', err);
                                    reject(err);
                                });
                        });
                    };
                    
                    // 执行所有操作
                    console.log('开始执行批量创建设备...');
                    createDevices()
                        .then(() => {
                            console.log('✓ 所有设备创建完成，开始更新配件库存...');
                            return updateAccessoryStock();
                        })
                        .then(() => {
                            console.log('✓ 配件库存更新完成，准备提交事务...');
                            db.commit((err) => {
                                if (err) {
                                    console.error('事务提交失败:', err);
                                    return db.rollback(() => {
                                        res.status(500).json({ success: false, message: '事务提交失败' });
                                    });
                                }
                                
                                console.log('✓ 事务提交成功！');
                                console.log('组装完成的设备:', assembledDevices);
                                
                                res.json({ 
                                    success: true, 
                                    message: `成功组装 ${assembleQuantity} 台 ${product.name} 设备`,
                                    devices: assembledDevices
                                });
                            });
                        })
                        .catch(err => {
                            console.error('组装过程中发生错误:', err);
                            console.error('错误详情:', err.message);
                            console.error('错误堆栈:', err.stack);
                            db.rollback(() => {
                                res.status(500).json({ success: false, message: '组装过程中发生错误: ' + err.message });
                            });
                        });
                });
            });
        });
    });
});

// 设备升级页面
app.get('/devices/upgrade/:deviceCode', isAuthenticated, (req, res) => {
    const deviceCode = req.params.deviceCode;
    
    // 获取设备信息
    db.query(`
        SELECT d.*, p.name as product_name, p.model_number as product_specifications
        FROM devices d
        LEFT JOIN products p ON d.product_id = p.id
        WHERE d.device_code = ?
    `, [deviceCode], (err, devices) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (devices.length === 0) {
            return res.status(404).send('设备不存在');
        }
        
        const device = devices[0];

        // 仅限制维护、退役等状态，允许在仓库 / 可用 / 已租出设备升级
        if (device.status !== 'in_warehouse' && device.status !== 'available' && device.status !== 'rented') {
            return res.status(400).send('当前设备状态不允许升级，仅在设备处于"在仓库"、"可用"或"已租出"状态时才能升级');
        }

        // 工具函数：加载产品列表、可用配件并渲染页面
        const loadUpgradePage = (currentAccessoriesForView) => {
            // 获取所有产品用于选择新产品型号
            db.query('SELECT * FROM products ORDER BY name', (err, products) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器错误');
                }
                
                // 获取可用的配件（包含库存>0的配件，以及当前设备已使用的配件）
                const currentAccessoryIds = currentAccessoriesForView.map(ca => ca.accessory_id).filter(id => id != null);
                let accessoriesSql = `
                    SELECT a.*, ac.name as category_name
                    FROM accessories a
                    LEFT JOIN accessory_categories ac ON a.category_id = ac.id
                    WHERE a.stock_quantity > 0
                `;
                const accessoriesParams = [];

                if (currentAccessoryIds.length > 0) {
                    accessoriesSql += ' OR a.id IN (?)';
                    accessoriesParams.push(currentAccessoryIds);
                }

                accessoriesSql += '\n                    ORDER BY a.category_id, a.brand, a.model';

                db.query(accessoriesSql, accessoriesParams, (err, availableAccessories) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('服务器错误');
                    }
                    
                    res.render('devices/upgrade', {
                        device: device,
                        currentAccessories: currentAccessoriesForView,
                        products: products,
                        availableAccessories: availableAccessories,
                        user: req.session.user,
                        moment: moment,
                        active: 'devices',
                        pageTitle: '设备升级 - ' + deviceCode
                    });
                });
            });
        };
        
        // 先获取设备的当前配件；如果没有，则回退到产品标准配置
        db.query(`
            SELECT da.*, a.category_id, ac.name as category_name
            FROM device_assemblies da
            LEFT JOIN accessories a ON da.accessory_id = a.id
            LEFT JOIN accessory_categories ac ON a.category_id = ac.id
            WHERE da.device_id = ?
        `, [device.id], (err, currentAccessories) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }

            if (!currentAccessories || currentAccessories.length === 0) {
                // 没有实际装配记录，使用产品标准配置（product_accessories）作为当前配件
                db.query(`
                    SELECT 
                        a.id AS accessory_id,
                        a.name AS accessory_name,
                        a.brand,
                        a.model,
                        ac.name AS category_name,
                        pa.quantity
                    FROM product_accessories pa
                    JOIN accessories a ON pa.accessory_id = a.id
                    JOIN accessory_categories ac ON a.category_id = ac.id
                    WHERE pa.product_id = ?
                    ORDER BY ac.name
                `, [device.product_id], (err, templateAccessories) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('服务器错误');
                    }

                    const mappedAccessories = templateAccessories.map(row => ({
                        accessory_id: row.accessory_id,
                        category_name: row.category_name,
                        accessory_name: row.accessory_name,
                        brand: row.brand,
                        model: row.model,
                        quantity: row.quantity || 1
                    }));

                    return loadUpgradePage(mappedAccessories);
                });
            } else {
                // 有实际装配记录，直接使用
                return loadUpgradePage(currentAccessories);
            }
        });
    });
});

// 执行设备升级
app.post('/devices/upgrade', isAuthenticated, (req, res) => {
    const { deviceCode, newProductCode, upgradeType, oldAccessoryId, newAccessoryId, description } = req.body;
    
    if (!deviceCode || !newProductCode || !upgradeType) {
        return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    if ((upgradeType === 'component_replace' || upgradeType === 'component_remove') && !oldAccessoryId) {
        return res.status(400).json({ success: false, message: '请选择要更换的配件' });
    }
    
    if ((upgradeType === 'component_add' || upgradeType === 'component_replace') && !newAccessoryId) {
        return res.status(400).json({ success: false, message: '请选择新配件' });
    }
    
    // 获取设备信息
    db.query(`
        SELECT d.*, p.name as product_name
        FROM devices d
        LEFT JOIN products p ON d.product_id = p.id
        WHERE d.device_code = ?
    `, [deviceCode], (err, devices) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
        
        if (devices.length === 0) {
            return res.status(400).json({ success: false, message: '设备不存在' });
        }
        
        const device = devices[0];

        // 仅限制维护、退役等状态，允许在仓库 / 可用 / 已租出设备执行升级
        if (device.status !== 'in_warehouse' && device.status !== 'available' && device.status !== 'rented') {
            return res.status(400).json({ success: false, message: '当前设备状态不允许升级，仅在设备处于"在仓库"、"可用"或"已租出"状态时才能升级' });
        }
        
        // 获取新产品信息
        db.query('SELECT * FROM products WHERE product_code = ?', [newProductCode], (err, products) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: '服务器错误' });
            }
            
            if (products.length === 0) {
                return res.status(400).json({ success: false, message: '新产品型号不存在' });
            }
            
            const newProduct = products[0];
            
            // 获取新产品的最大设备编号
            db.query(`
                SELECT device_code
                FROM devices
                WHERE product_code = ?
                ORDER BY device_code DESC
                LIMIT 1
            `, [newProductCode], (err, maxDeviceResult) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ success: false, message: '服务器错误' });
                }
                
                let nextDeviceNumber = 1;
                if (maxDeviceResult.length > 0) {
                    const maxDeviceCode = maxDeviceResult[0].device_code;
                    const parts = maxDeviceCode.split('-');
                    if (parts.length > 1) {
                        const currentNumber = parseInt(parts[1]);
                        if (!isNaN(currentNumber)) {
                            nextDeviceNumber = currentNumber + 1;
                        }
                    }
                }
                
                const newDeviceCode = `${newProductCode}-${nextDeviceNumber.toString().padStart(3, '0')}`;
                
                // 开始事务
                db.beginTransaction((err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ success: false, message: '事务开启失败' });
                    }
                    
                    let newDeviceId = null;
                    
                    // 步骤1：根据升级类型处理配件库存
                    const handleAccessoryStock = () => {
                        return new Promise((resolve, reject) => {
                            if (upgradeType === 'component_replace') {
                                // 更换配件：旧配件库存+1，新配件库存-1
                                db.query(`
                                    UPDATE accessories
                                    SET stock_quantity = stock_quantity + 1,
                                        status = 'in_warehouse',
                                        updated_at = NOW()
                                    WHERE id = ?
                                `, [oldAccessoryId], (err) => {
                                    if (err) {
                                        return reject(err);
                                    }
                                    
                                    db.query(`
                                        UPDATE accessories
                                        SET stock_quantity = stock_quantity - 1,
                                            status = CASE 
                                                WHEN stock_quantity - 1 = 0 THEN 'assembled'
                                                WHEN stock_quantity - 1 > 0 THEN 'in_warehouse'
                                                ELSE status
                                            END,
                                            updated_at = NOW()
                                        WHERE id = ?
                                    `, [newAccessoryId], (err) => {
                                        if (err) {
                                            return reject(err);
                                        }
                                        resolve();
                                    });
                                });
                            } else if (upgradeType === 'component_add') {
                                // 添加配件：新配件库存-1
                                db.query(`
                                    UPDATE accessories
                                    SET stock_quantity = stock_quantity - 1,
                                        status = CASE 
                                            WHEN stock_quantity - 1 = 0 THEN 'assembled'
                                            WHEN stock_quantity - 1 > 0 THEN 'in_warehouse'
                                            ELSE status
                                        END,
                                        updated_at = NOW()
                                    WHERE id = ?
                                `, [newAccessoryId], (err) => {
                                    if (err) {
                                        return reject(err);
                                    }
                                    resolve();
                                });
                            } else if (upgradeType === 'component_remove') {
                                // 移除配件：旧配件库存+1
                                db.query(`
                                    UPDATE accessories
                                    SET stock_quantity = stock_quantity + 1,
                                        status = 'in_warehouse',
                                        updated_at = NOW()
                                    WHERE id = ?
                                `, [oldAccessoryId], (err) => {
                                    if (err) {
                                        return reject(err);
                                    }
                                    resolve();
                                });
                            } else {
                                resolve();
                            }
                        });
                    };
                    
                    // 步骤2：创建设备副本（新设备）
                    const createNewDevice = () => {
                        return new Promise((resolve, reject) => {
                            const assemblyDate = device.assembly_date || new Date();
                            db.query(`
                                INSERT INTO devices (
                                    device_code, product_id, product_code, device_name,
                                    status, assembly_date, created_at, updated_at, last_upgrade_date
                                ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
                            `, [
                                newDeviceCode,
                                newProduct.id,
                                newProductCode,
                                newProduct.name,
                                device.status,
                                assemblyDate
                            ], (err, result) => {
                                if (err) {
                                    return reject(err);
                                }
                                newDeviceId = result.insertId;
                                resolve();
                            });
                        });
                    };
                    
                    // 步骤3：克隆旧设备配件到新设备
                    const cloneDeviceAssemblies = () => {
                        return new Promise((resolve, reject) => {
                            db.query(`
                                INSERT INTO device_assemblies (
                                    device_id, accessory_id, accessory_name,
                                    brand, model, quantity, created_at
                                )
                                SELECT ?, accessory_id, accessory_name,
                                       brand, model, quantity, created_at
                                FROM device_assemblies
                                WHERE device_id = ?
                            `, [newDeviceId, device.id], (err) => {
                                if (err) {
                                    return reject(err);
                                }
                                resolve();
                            });
                        });
                    };
                    
                    // 步骤4：在新设备上更新设备组装记录
                    const updateDeviceAssemblies = () => {
                        return new Promise((resolve, reject) => {
                            // 根据升级类型处理
                            if (upgradeType === 'component_replace') {
                                // 更换配件
                                db.query(`
                                    UPDATE device_assemblies
                                    SET accessory_id = ?, created_at = NOW()
                                    WHERE device_id = ? AND accessory_id = ?
                                `, [newAccessoryId, newDeviceId, oldAccessoryId], (err) => {
                                    if (err) {
                                        return reject(err);
                                    }
                                    
                                    // 更新配件名称
                                    db.query(`
                                        SELECT name, brand, model
                                        FROM accessories
                                        WHERE id = ?
                                    `, [newAccessoryId], (err, accessoryInfo) => {
                                        if (err) {
                                            return reject(err);
                                        }
                                        
                                        if (accessoryInfo.length > 0) {
                                            const info = accessoryInfo[0];
                                            db.query(`
                                                UPDATE device_assemblies
                                                SET accessory_name = ?, brand = ?, model = ?
                                                WHERE device_id = ? AND accessory_id = ?
                                            `, [info.name, info.brand, info.model, newDeviceId, newAccessoryId], (err) => {
                                                if (err) {
                                                    return reject(err);
                                                }
                                                resolve();
                                            });
                                        } else {
                                            resolve();
                                        }
                                    });
                                });
                            } else if (upgradeType === 'component_add') {
                                // 添加配件
                                db.query(`
                                    SELECT name, brand, model, category_id
                                    FROM accessories
                                    WHERE id = ?
                                `, [newAccessoryId], (err, accessoryInfo) => {
                                    if (err) {
                                        return reject(err);
                                    }
                                    
                                    if (accessoryInfo.length > 0) {
                                        const info = accessoryInfo[0];
                                        db.query(`
                                            INSERT INTO device_assemblies (
                                                device_id, accessory_id, accessory_name, 
                                                brand, model, quantity, created_at
                                            ) VALUES (?, ?, ?, ?, ?, 1, NOW())
                                        `, [newDeviceId, newAccessoryId, info.name, info.brand, info.model], (err) => {
                                            if (err) {
                                                return reject(err);
                                            }
                                            resolve();
                                        });
                                    } else {
                                        resolve();
                                    }
                                });
                            } else if (upgradeType === 'component_remove') {
                                // 移除配件
                                db.query(`
                                    DELETE FROM device_assemblies
                                    WHERE device_id = ? AND accessory_id = ?
                                `, [newDeviceId, oldAccessoryId], (err) => {
                                    if (err) {
                                        return reject(err);
                                    }
                                    resolve();
                                });
                            } else {
                                resolve();
                            }
                        });
                    };
                    
                    // 步骤5：标记旧设备为已升级
                    const markOldDeviceAsUpgraded = () => {
                        return new Promise((resolve, reject) => {
                            db.query(`
                                UPDATE devices
                                SET status = 'upgraded', last_upgrade_date = NOW(), updated_at = NOW()
                                WHERE id = ?
                            `, [device.id], (err) => {
                                if (err) {
                                    return reject(err);
                                }
                                resolve();
                            });
                        });
                    };

                    // 步骤6：如果设备正在出租，将未归还的租赁明细指向新设备
                    const rebindActiveRentalOrderItems = () => {
                        return new Promise((resolve, reject) => {
                            if (device.status !== 'rented') {
                                return resolve();
                            }

                            db.query(
                                'UPDATE rental_order_items SET device_id = ? WHERE device_id = ? AND actual_return_date IS NULL',
                                [newDeviceId, device.id],
                                (err) => {
                                    if (err) {
                                        return reject(err);
                                    }
                                    resolve();
                                }
                            );
                        });
                    };
                    
                    // 步骤7：记录升级历史
                    const recordUpgradeHistory = () => {
                        return new Promise((resolve, reject) => {
                            let accessoryName = '';
                            
                            // 获取配件名称
                            if (oldAccessoryId) {
                                db.query('SELECT name FROM accessories WHERE id = ?', [oldAccessoryId], (err, result) => {
                                    if (err) {
                                        return reject(err);
                                    }
                                    
                                    if (result.length > 0) {
                                        accessoryName = result[0].name;
                                    }
                                    
                                    insertRecord();
                                });
                            } else {
                                insertRecord();
                            }
                            
                            function insertRecord() {
                                db.query(`
                                    INSERT INTO device_upgrades (
                                        device_id, old_product_code, new_product_code,
                                        old_device_code, new_device_code, upgrade_type,
                                        old_accessory_id, new_accessory_id, accessory_name,
                                        description, operator_id, upgrade_date
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                                `, [
                                    newDeviceId, device.product_code, newProductCode,
                                    deviceCode, newDeviceCode, upgradeType,
                                    oldAccessoryId, newAccessoryId, accessoryName,
                                    description, req.session.user.id
                                ], (err) => {
                                    if (err) {
                                        return reject(err);
                                    }
                                    resolve();
                                });
                            }
                        });
                    };
                    
                    // 执行所有操作
                    handleAccessoryStock()
                        .then(() => createNewDevice())
                        .then(() => cloneDeviceAssemblies())
                        .then(() => updateDeviceAssemblies())
                        .then(() => markOldDeviceAsUpgraded())
                        .then(() => rebindActiveRentalOrderItems())
                        .then(() => recordUpgradeHistory())
                        .then(() => {
                            db.commit((err) => {
                                if (err) {
                                    console.error(err);
                                    return db.rollback(() => {
                                        res.status(500).json({ success: false, message: '事务提交失败' });
                                    });
                                }
                                
                                res.json({ 
                                    success: true, 
                                    message: `设备升级成功，新设备编号: ${newDeviceCode}`,
                                    newDeviceCode: newDeviceCode
                                });
                            });
                        })
                        .catch(err => {
                            console.error(err);
                            db.rollback(() => {
                                res.status(500).json({ success: false, message: '升级过程中发生错误' });
                            });
                        });
                });
            });
        });
    });
});

// 设备详情页面
app.get('/devices/view/:deviceCode', isAuthenticated, (req, res) => {
    const deviceCode = req.params.deviceCode;
    
    // 获取设备信息
    db.query(`
        SELECT d.*, p.name as product_name, p.model_number as product_specifications
        FROM devices d
        LEFT JOIN products p ON d.product_id = p.id
        WHERE d.device_code = ?
    `, [deviceCode], (err, devices) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (devices.length === 0) {
            return res.status(404).send('设备不存在');
        }
        
        const device = devices[0];
        
        // 工具函数：查询升级历史并渲染页面
        const loadUpgradeHistoryAndRender = (finalAccessories) => {
            db.query(`
                SELECT 
                    du.*,
                    u.username as operator_name,
                    p_old.name as old_product_name,
                    p_new.name as new_product_name,
                    a_old.name as old_accessory_name,
                    a_new.name as new_accessory_name
                FROM device_upgrades du
                LEFT JOIN users u ON du.operator_id = u.id
                LEFT JOIN products p_old ON du.old_product_code = p_old.product_code
                LEFT JOIN products p_new ON du.new_product_code = p_new.product_code
                LEFT JOIN accessories a_old ON du.old_accessory_id = a_old.id
                LEFT JOIN accessories a_new ON du.new_accessory_id = a_new.id
                WHERE du.device_id = ?
                ORDER BY du.upgrade_date DESC
            `, [device.id], (err, upgradeHistory) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器错误');
                }

                const rentalHistoryQuery = `
                    SELECT
                        roi.id AS item_id,
                        roi.start_date,
                        roi.end_date,
                        roi.actual_return_date,
                        roi.daily_rate,
                        roi.monthly_rate,
                        ro.id AS rental_order_id,
                        ro.order_number,
                        ro.status AS order_status,
                        ro.start_date AS order_start_date,
                        ro.end_date AS order_end_date,
                        c.name AS customer_name
                    FROM rental_order_items roi
                    JOIN rental_orders ro ON roi.order_id = ro.id
                    JOIN customers c ON ro.customer_id = c.id
                    WHERE roi.device_id = ?
                    ORDER BY roi.start_date DESC
                `;

                db.query(rentalHistoryQuery, [device.id], (historyErr, rentalHistory) => {
                    if (historyErr) {
                        console.error(historyErr);
                        return res.status(500).send('服务器错误');
                    }

                    // 计算该设备累计租金收入（按日租金 * 租用天数，忽略待处理/已取消订单）
                    let totalRentalIncome = 0;
                    const nowMoment = moment().startOf('day');

                    if (Array.isArray(rentalHistory)) {
                        rentalHistory.forEach((record) => {
                            if (!record.start_date) {
                                return;
                            }

                            if (record.order_status === 'pending' || record.order_status === 'cancelled') {
                                return;
                            }

                            const start = moment(record.start_date);
                            let end;

                            if (record.actual_return_date) {
                                end = moment(record.actual_return_date);
                            } else if (record.end_date) {
                                end = moment(record.end_date);
                            } else {
                                end = nowMoment;
                            }

                            let days = end.diff(start, 'days');
                            if (days < 1) {
                                days = 1;
                            }

                            let dailyRate = 0;
                            if (record.daily_rate && record.daily_rate > 0) {
                                dailyRate = parseFloat(record.daily_rate) || 0;
                            } else if (record.monthly_rate && record.monthly_rate > 0) {
                                dailyRate = (parseFloat(record.monthly_rate) || 0) / 30;
                            }

                            if (!Number.isNaN(dailyRate) && dailyRate > 0) {
                                totalRentalIncome += dailyRate * days;
                            }
                        });
                    }

                    // 根据配件计算原始采购价格和当前折旧后价格
                    let originalPurchasePrice = 0;
                    let currentDepreciatedPrice = 0;

                    if (Array.isArray(finalAccessories) && finalAccessories.length > 0) {
                        finalAccessories.forEach((acc) => {
                            const quantity = acc.quantity || 1;
                            
                            // 原始采购价格 = 配件采购价 * 数量
                            const purchasePrice = parseFloat(acc.purchase_price) || 0;
                            originalPurchasePrice += purchasePrice * quantity;
                            
                            // 当前折旧后价格 = 配件当前单价 * 数量
                            const currentPrice = parseFloat(acc.unit_price) || 0;
                            currentDepreciatedPrice += currentPrice * quantity;
                        });
                    }

                    // 贬值金额 = 原始采购价格 - 折旧后价格
                    const depreciationAmount = originalPurchasePrice - currentDepreciatedPrice;
                    
                    // 毛利 = 累计租金收入 - 贬值金额
                    const grossProfit = totalRentalIncome - depreciationAmount;

                    const deviceFinancial = {
                        totalRentalIncome: totalRentalIncome,
                        originalPurchasePrice: originalPurchasePrice,
                        currentDepreciatedPrice: currentDepreciatedPrice,
                        depreciationAmount: depreciationAmount,
                        grossProfit: grossProfit
                    };

                    res.render('devices/view', {
                        device: device,
                        accessories: finalAccessories,
                        upgradeHistory: upgradeHistory,
                        rentalHistory: rentalHistory,
                        deviceFinancial: deviceFinancial,
                        user: req.session.user,
                        moment: moment,
                        active: 'devices',
                        pageTitle: '设备详情 - ' + deviceCode
                    });
                });
            });
        };
        
        // 先获取设备的实际配件（device_assemblies），同时获取配件的价格和批次信息
        db.query(`
            SELECT 
                da.*, 
                a.category_id, 
                COALESCE(da.purchase_price, abs.purchase_price, a.purchase_price) as purchase_price,
                COALESCE(latest_price.price, da.purchase_price, abs.purchase_price, a.purchase_price) as unit_price,
                ac.name as category_name,
                abs.unique_id AS unique_batch_id
            FROM device_assemblies da
            LEFT JOIN accessories a ON da.accessory_id = a.id
            LEFT JOIN accessory_categories ac ON a.category_id = ac.id
            LEFT JOIN accessory_batch_stock abs ON da.batch_stock_id = abs.id
            LEFT JOIN (
                SELECT aph1.*
                FROM accessory_price_history aph1
                JOIN (
                    SELECT accessory_id, MAX(month_year) as max_month_year 
                    FROM accessory_price_history 
                    GROUP BY accessory_id
                ) latest ON aph1.accessory_id = latest.accessory_id
                         AND aph1.month_year = latest.max_month_year
            ) latest_price ON a.id = latest_price.accessory_id
            WHERE da.device_id = ?
            ORDER BY ac.name
        `, [device.id], (err, accessories) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }

            // 如果该设备没有实际装配记录，则回退到产品标准配置（product_accessories）
            if (!accessories || accessories.length === 0) {
                db.query(`
                    SELECT 
                        a.name AS accessory_name,
                        a.brand,
                        a.model,
                        COALESCE(latest_price.price, a.purchase_price) as unit_price,
                        a.purchase_price,
                        ac.name AS category_name,
                        pa.quantity
                    FROM product_accessories pa
                    JOIN accessories a ON pa.accessory_id = a.id
                    JOIN accessory_categories ac ON a.category_id = ac.id
                    LEFT JOIN (
                        SELECT aph1.*
                        FROM accessory_price_history aph1
                        JOIN (
                            SELECT accessory_id, MAX(month_year) as max_month_year 
                            FROM accessory_price_history 
                            GROUP BY accessory_id
                        ) latest ON aph1.accessory_id = latest.accessory_id
                                 AND aph1.month_year = latest.max_month_year
                    ) latest_price ON a.id = latest_price.accessory_id
                    WHERE pa.product_id = ?
                    ORDER BY ac.name
                `, [device.product_id], (err, templateAccessories) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('服务器错误');
                    }

                    // 将模板配件映射到视图期望的字段结构
                    const mappedAccessories = templateAccessories.map(row => ({
                        category_name: row.category_name,
                        accessory_name: row.accessory_name,
                        brand: row.brand,
                        model: row.model,
                        quantity: row.quantity || 1,
                        unit_price: row.unit_price,
                        purchase_price: row.purchase_price
                    }));

                    return loadUpgradeHistoryAndRender(mappedAccessories);
                });
            } else {
                // 有实际装配记录，直接使用
                return loadUpgradeHistoryAndRender(accessories);
            }
        });
    });
});

// 微信扫码入口，根据是否登录展示不同视图
app.get('/wechat/device/:deviceCode', (req, res) => {
    const deviceCode = req.params.deviceCode;

    db.query(`
        SELECT d.*, p.name as product_name, p.model_number as product_specifications,
               p.rental_price_per_month, p.rental_price_per_day
        FROM devices d
        LEFT JOIN products p ON d.product_id = p.id
        WHERE d.device_code = ?
    `, [deviceCode], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }

        if (!results || results.length === 0) {
            return res.status(404).send('设备不存在');
        }

        const device = results[0];
        const user = req.session.user || null;
        const isEmployee = !!user;

        if (isEmployee) {
            return res.render('wechat-device-employee', {
                device: device,
                user: user,
                moment: moment
            });
        }

        return res.render('wechat-device-guest', {
            device: device,
            user: null,
            moment: moment
        });
    });
});

// 手机端创建租赁入口
app.get('/mobile-rental/create/:deviceCode', (req, res) => {
    const deviceCode = req.params.deviceCode;
    const user = req.session.user;

    if (!user) {
        return res.redirect(`/login?redirect=/mobile-rental/create/${deviceCode}`);
    }

    db.query(`
        SELECT d.*, p.name as product_name, p.model_number as product_specifications,
               p.rental_price_per_month, p.rental_price_per_day
        FROM devices d
        LEFT JOIN products p ON d.product_id = p.id
        WHERE d.device_code = ?
    `, [deviceCode], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }

        if (!results || results.length === 0) {
            return res.status(404).send('设备不存在');
        }

        const device = results[0];

        res.render('mobile-rental-draft', {
            device: device,
            user: user,
            moment: moment
        });
    });
});

// ==================== 基础信息管理API ====================

// 基础信息管理页面路由
app.get('/basic-info', isAuthenticated, (req, res) => {
    res.render('basic-info/index');
});

// 客户API
app.get('/api/customers', isAuthenticated, (req, res) => {
    const keyword = req.query.keyword || '';
    let query = 'SELECT * FROM customers WHERE 1=1';
    const params = [];
    
    if (keyword) {
        query += ' AND (name LIKE ? OR contact_person LIKE ? OR contact_phone LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    
    query += ' ORDER BY created_at DESC';
    
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('查询客户失败:', err);
            return res.json({ success: false, message: '查询失败' });
        }
        res.json({ success: true, data: results });
    });
});

app.get('/api/customers/:id', isAuthenticated, (req, res) => {
    db.query('SELECT * FROM customers WHERE id = ?', [req.params.id], (err, results) => {
        if (err) {
            return res.json({ success: false, message: '查询失败' });
        }
        res.json({ success: true, data: results[0] });
    });
});

app.post('/api/customers', isAuthenticated, (req, res) => {
    const { name, contact_person, contact_phone, address, credit_rating, notes } = req.body;
    
    db.query(
        'INSERT INTO customers (name, contact_person, contact_phone, address, credit_rating, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [name, contact_person, contact_phone, address, credit_rating || 'B', notes],
        (err, result) => {
            if (err) {
                console.error('添加客户失败:', err);
                return res.json({ success: false, message: '添加失败' });
            }
            res.json({ success: true, message: '添加成功', id: result.insertId });
        }
    );
});

app.put('/api/customers/:id', isAuthenticated, (req, res) => {
    const { name, contact_person, contact_phone, address, credit_rating, notes } = req.body;
    
    db.query(
        'UPDATE customers SET name = ?, contact_person = ?, contact_phone = ?, address = ?, credit_rating = ?, notes = ? WHERE id = ?',
        [name, contact_person, contact_phone, address, credit_rating, notes, req.params.id],
        (err) => {
            if (err) {
                console.error('更新客户失败:', err);
                return res.json({ success: false, message: '更新失败' });
            }
            res.json({ success: true, message: '更新成功' });
        }
    );
});

app.delete('/api/customers/:id', isAuthenticated, (req, res) => {
    db.query('DELETE FROM customers WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            console.error('删除客户失败:', err);
            return res.json({ success: false, message: '删除失败' });
        }
        res.json({ success: true, message: '删除成功' });
    });
});

// 供应商API
app.get('/api/suppliers', isAuthenticated, (req, res) => {
    const keyword = req.query.keyword || '';
    let query = 'SELECT * FROM suppliers WHERE 1=1';
    const params = [];
    
    if (keyword) {
        query += ' AND (name LIKE ? OR contact_person LIKE ? OR contact_phone LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    
    query += ' ORDER BY created_at DESC';
    
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('查询供应商失败:', err);
            return res.json({ success: false, message: '查询失败' });
        }
        res.json({ success: true, data: results });
    });
});

app.get('/api/suppliers/:id', isAuthenticated, (req, res) => {
    db.query('SELECT * FROM suppliers WHERE id = ?', [req.params.id], (err, results) => {
        if (err) {
            return res.json({ success: false, message: '查询失败' });
        }
        res.json({ success: true, data: results[0] });
    });
});

app.post('/api/suppliers', isAuthenticated, (req, res) => {
    const { name, contact_person, contact_phone, address, notes } = req.body;
    
    db.query(
        'INSERT INTO suppliers (name, contact_person, contact_phone, address, notes) VALUES (?, ?, ?, ?, ?)',
        [name, contact_person, contact_phone, address, notes],
        (err, result) => {
            if (err) {
                console.error('添加供应商失败:', err);
                return res.json({ success: false, message: '添加失败' });
            }
            res.json({ success: true, message: '添加成功', id: result.insertId });
        }
    );
});

app.put('/api/suppliers/:id', isAuthenticated, (req, res) => {
    const { name, contact_person, contact_phone, address, notes } = req.body;
    
    db.query(
        'UPDATE suppliers SET name = ?, contact_person = ?, contact_phone = ?, address = ?, notes = ? WHERE id = ?',
        [name, contact_person, contact_phone, address, notes, req.params.id],
        (err) => {
            if (err) {
                console.error('更新供应商失败:', err);
                return res.json({ success: false, message: '更新失败' });
            }
            res.json({ success: true, message: '更新成功' });
        }
    );
});

app.delete('/api/suppliers/:id', isAuthenticated, (req, res) => {
    db.query('DELETE FROM suppliers WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            console.error('删除供应商失败:', err);
            return res.json({ success: false, message: '删除失败' });
        }
        res.json({ success: true, message: '删除成功' });
    });
});

// 客户API
app.get('/api/customers', isAuthenticated, (req, res) => {
    const keyword = req.query.keyword || '';
    let query = 'SELECT * FROM customers WHERE 1=1';
    const params = [];
    
    if (keyword) {
        query += ' AND (name LIKE ? OR contact_person LIKE ? OR contact_phone LIKE ? OR customer_code LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    
    query += ' ORDER BY created_at DESC';
    
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('查询客户失败:', err);
            return res.json({ success: false, message: '查询失败' });
        }
        res.json({ success: true, data: results });
    });
});

app.get('/api/customers/:id', isAuthenticated, (req, res) => {
    db.query('SELECT * FROM customers WHERE id = ?', [req.params.id], (err, results) => {
        if (err) {
            return res.json({ success: false, message: '查询失败' });
        }
        res.json({ success: true, data: results[0] });
    });
});

app.post('/api/customers', isAuthenticated, (req, res) => {
    const { name, contact_person, contact_phone, address, credit_rating, notes } = req.body;
    
    // 生成客户编号
    db.query('SELECT MAX(CAST(SUBSTRING(customer_code, 2) AS UNSIGNED)) as max_code FROM customers WHERE customer_code LIKE "C%"', (err, results) => {
        if (err) {
            console.error('查询客户编号失败:', err);
            return res.json({ success: false, message: '生成客户编号失败' });
        }
        
        const maxCode = results[0].max_code || 0;
        const newCode = 'C' + String(maxCode + 1).padStart(5, '0');
        
        db.query(
            'INSERT INTO customers (customer_code, name, contact_person, contact_phone, address, credit_rating, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [newCode, name, contact_person, contact_phone, address, credit_rating || 'B', notes],
            (err, result) => {
                if (err) {
                    console.error('添加客户失败:', err);
                    return res.json({ success: false, message: '添加失败' });
                }
                res.json({ success: true, message: '添加成功', id: result.insertId });
            }
        );
    });
});

app.put('/api/customers/:id', isAuthenticated, (req, res) => {
    const { name, contact_person, contact_phone, address, credit_rating, notes } = req.body;
    
    db.query(
        'UPDATE customers SET name = ?, contact_person = ?, contact_phone = ?, address = ?, credit_rating = ?, notes = ? WHERE id = ?',
        [name, contact_person, contact_phone, address, credit_rating, notes, req.params.id],
        (err) => {
            if (err) {
                console.error('更新客户失败:', err);
                return res.json({ success: false, message: '更新失败' });
            }
            res.json({ success: true, message: '更新成功' });
        }
    );
});

app.delete('/api/customers/:id', isAuthenticated, (req, res) => {
    db.query('DELETE FROM customers WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            console.error('删除客户失败:', err);
            return res.json({ success: false, message: '删除失败' });
        }
        res.json({ success: true, message: '删除成功' });
    });
});

// 合作伙伴API
app.get('/api/partners', isAuthenticated, (req, res) => {
    const keyword = req.query.keyword || '';
    let query = 'SELECT * FROM partners WHERE 1=1';
    const params = [];
    
    if (keyword) {
        query += ' AND (name LIKE ? OR contact_person LIKE ? OR phone LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    
    query += ' ORDER BY created_at DESC';
    
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('查询合作伙伴失败:', err);
            return res.json({ success: false, message: '查询失败' });
        }
        res.json({ success: true, data: results });
    });
});

app.get('/api/partners/:id', isAuthenticated, (req, res) => {
    db.query('SELECT * FROM partners WHERE id = ?', [req.params.id], (err, results) => {
        if (err) {
            return res.json({ success: false, message: '查询失败' });
        }
        res.json({ success: true, data: results[0] });
    });
});

app.post('/api/partners', isAuthenticated, (req, res) => {
    const { name, contact_person, phone, commission_rate, status, notes } = req.body;
    
    db.query(
        'INSERT INTO partners (name, contact_person, phone, commission_rate, status, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [name, contact_person, phone, commission_rate, status || 'active', notes],
        (err, result) => {
            if (err) {
                console.error('添加合作伙伴失败:', err);
                return res.json({ success: false, message: '添加失败' });
            }
            res.json({ success: true, message: '添加成功', id: result.insertId });
        }
    );
});

app.put('/api/partners/:id', isAuthenticated, (req, res) => {
    const { name, contact_person, phone, commission_rate, status, notes } = req.body;
    
    db.query(
        'UPDATE partners SET name = ?, contact_person = ?, phone = ?, commission_rate = ?, status = ?, notes = ? WHERE id = ?',
        [name, contact_person, phone, commission_rate, status, notes, req.params.id],
        (err) => {
            if (err) {
                console.error('更新合作伙伴失败:', err);
                return res.json({ success: false, message: '更新失败' });
            }
            res.json({ success: true, message: '更新成功' });
        }
    );
});

app.delete('/api/partners/:id', isAuthenticated, (req, res) => {
    db.query('DELETE FROM partners WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            console.error('删除合作伙伴失败:', err);
            return res.json({ success: false, message: '删除失败' });
        }
        res.json({ success: true, message: '删除成功' });
    });
});

// 配件类别API
app.get('/api/categories', isAuthenticated, (req, res) => {
    db.query(`
        SELECT ac.*, 
               COUNT(a.id) as accessory_count 
        FROM accessory_categories ac 
        LEFT JOIN accessories a ON ac.id = a.category_id 
        GROUP BY ac.id 
        ORDER BY ac.created_at DESC
    `, (err, results) => {
        if (err) {
            console.error('查询类别失败:', err);
            return res.json({ success: false, message: '查询失败' });
        }
        res.json({ success: true, data: results });
    });
});

app.get('/api/categories/:id', isAuthenticated, (req, res) => {
    db.query('SELECT * FROM accessory_categories WHERE id = ?', [req.params.id], (err, results) => {
        if (err) {
            return res.json({ success: false, message: '查询失败' });
        }
        res.json({ success: true, data: results[0] });
    });
});

app.post('/api/categories', isAuthenticated, (req, res) => {
    const { name, description } = req.body;
    
    db.query(
        'INSERT INTO accessory_categories (name, description) VALUES (?, ?)',
        [name, description],
        (err, result) => {
            if (err) {
                console.error('添加类别失败:', err);
                return res.json({ success: false, message: '添加失败' });
            }
            res.json({ success: true, message: '添加成功', id: result.insertId });
        }
    );
});

app.put('/api/categories/:id', isAuthenticated, (req, res) => {
    const { name, description } = req.body;
    
    db.query(
        'UPDATE accessory_categories SET name = ?, description = ? WHERE id = ?',
        [name, description, req.params.id],
        (err) => {
            if (err) {
                console.error('更新类别失败:', err);
                return res.json({ success: false, message: '更新失败' });
            }
            res.json({ success: true, message: '更新成功' });
        }
    );
});

app.delete('/api/categories/:id', isAuthenticated, (req, res) => {
    // 先检查是否有配件使用该类别
    db.query('SELECT COUNT(*) as count FROM accessories WHERE category_id = ?', [req.params.id], (err, results) => {
        if (err) {
            return res.json({ success: false, message: '检查失败' });
        }
        
        if (results[0].count > 0) {
            return res.json({ success: false, message: '该类别下还有配件，无法删除' });
        }
        
        db.query('DELETE FROM accessory_categories WHERE id = ?', [req.params.id], (err) => {
            if (err) {
                console.error('删除类别失败:', err);
                return res.json({ success: false, message: '删除失败' });
            }
            res.json({ success: true, message: '删除成功' });
        });
    });
});

// 用户API
app.get('/api/users', isAuthenticated, (req, res) => {
    db.query('SELECT id, username, real_name, role, email, status, created_at FROM users ORDER BY created_at DESC', (err, results) => {
        if (err) {
            console.error('查询用户失败:', err);
            return res.json({ success: false, message: '查询失败' });
        }
        res.json({ success: true, data: results });
    });
});

app.get('/api/users/:id', isAuthenticated, (req, res) => {
    db.query('SELECT id, username, real_name, role, email, status FROM users WHERE id = ?', [req.params.id], (err, results) => {
        if (err) {
            return res.json({ success: false, message: '查询失败' });
        }
        res.json({ success: true, data: results[0] });
    });
});

app.post('/api/users', isAuthenticated, (req, res) => {
    const { username, password, real_name, role, email } = req.body;
    const bcrypt = require('bcrypt');
    
    // 密码加密
    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
            return res.json({ success: false, message: '密码加密失败' });
        }
        
        db.query(
            'INSERT INTO users (username, password, real_name, role, email, status) VALUES (?, ?, ?, ?, ?, "active")',
            [username, hashedPassword, real_name, role, email],
            (err, result) => {
                if (err) {
                    console.error('添加用户失败:', err);
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.json({ success: false, message: '用户名已存在' });
                    }
                    return res.json({ success: false, message: '添加失败' });
                }
                res.json({ success: true, message: '添加成功', id: result.insertId });
            }
        );
    });
});

app.put('/api/users/:id', isAuthenticated, (req, res) => {
    const { password, real_name, role, email } = req.body;
    const bcrypt = require('bcrypt');
    
    if (password && password.trim() !== '') {
        // 如果提供了新密码，则更新密码
        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) {
                return res.json({ success: false, message: '密码加密失败' });
            }
            
            db.query(
                'UPDATE users SET password = ?, real_name = ?, role = ?, email = ? WHERE id = ?',
                [hashedPassword, real_name, role, email, req.params.id],
                (err) => {
                    if (err) {
                        console.error('更新用户失败:', err);
                        return res.json({ success: false, message: '更新失败' });
                    }
                    res.json({ success: true, message: '更新成功' });
                }
            );
        });
    } else {
        // 不更新密码
        db.query(
            'UPDATE users SET real_name = ?, role = ?, email = ? WHERE id = ?',
            [real_name, role, email, req.params.id],
            (err) => {
                if (err) {
                    console.error('更新用户失败:', err);
                    return res.json({ success: false, message: '更新失败' });
                }
                res.json({ success: true, message: '更新成功' });
            }
        );
    }
});

app.delete('/api/users/:id', isAuthenticated, (req, res) => {
    // 不允许删除当前登录用户
    if (req.session.user && req.session.user.id == req.params.id) {
        return res.json({ success: false, message: '不能删除当前登录用户' });
    }
    
    db.query('DELETE FROM users WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            console.error('删除用户失败:', err);
            return res.json({ success: false, message: '删除失败' });
        }
        res.json({ success: true, message: '删除成功' });
    });
});

// ==================== 基础信息管理API结束 ====================

// API: 获取客户列表（用于手机端搜索）
app.get('/api/customers/list', isAuthenticated, (req, res) => {
    db.query('SELECT id, name, contact_person, phone FROM customers WHERE status = "active" ORDER BY name', (err, results) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: '查询失败' });
        }
        res.json({ success: true, customers: results });
    });
});

// API: 根据设备编号获取设备信息（用于扫码添加设备）
app.get('/api/device/:deviceCode', isAuthenticated, (req, res) => {
    const deviceCode = req.params.deviceCode;
    
    db.query(`
        SELECT d.*, p.name as product_name, p.model_number as product_specifications,
               p.product_code, p.rental_price_per_month, p.rental_price_per_day
        FROM devices d
        LEFT JOIN products p ON d.product_id = p.id
        WHERE d.device_code = ?
    `, [deviceCode], (err, results) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: '查询失败' });
        }
        
        if (!results || results.length === 0) {
            return res.json({ success: false, message: '设备不存在' });
        }
        
        res.json({ success: true, device: results[0] });
    });
});

// 手机端创建租赁订单
app.post('/mobile-rental/create', (req, res) => {
    console.log('=== 手机端创建租赁订单 ===');
    console.log('请求数据:', JSON.stringify(req.body, null, 2));

    const user = req.session.user;
    if (!user) {
        return res.status(401).json({ success: false, message: '未登录' });
    }

    const {
        orderNumber,
        orderDate,
        customerId,
        startDate,
        endDate,
        paymentCycle,
        notes,
        deviceItems
    } = req.body;

    // 验证必填字段
    if (!orderNumber || !orderDate || !customerId || !paymentCycle || !startDate || !deviceItems || deviceItems.length === 0) {
        console.error('验证失败：缺少必填字段');
        return res.status(400).json({ success: false, message: '请填写所有必填字段并添加至少一个设备' });
    }

    // 先检查所有设备状态
    const deviceIds = deviceItems.map(item => item.deviceId);
    db.query('SELECT id, device_code, status FROM devices WHERE id IN (?)', [deviceIds], (err, deviceResults) => {
        if (err) {
            console.error('查询设备状态失败:', err);
            return res.status(500).json({ success: false, message: '查询设备状态失败' });
        }

        // 检查是否有已出租的设备
        const rentedDevices = deviceResults.filter(d => d.status === 'rented');
        if (rentedDevices.length > 0) {
            const rentedCodes = rentedDevices.map(d => d.device_code).join('、');
            return res.status(400).json({ success: false, message: `设备 ${rentedCodes} 已出租，无法创建订单` });
        }

        // 获取设备租金信息
        db.query(`
            SELECT d.id, d.device_code,
                   COALESCE(p.rental_price_per_day, p.calculated_daily_rent, 0) as rental_price_per_day,
                   COALESCE(p.rental_price_per_month, p.calculated_monthly_rent, 0) as rental_price_per_month
            FROM devices d
            JOIN products p ON d.product_id = p.id
            WHERE d.id IN (?)
        `, [deviceIds], (err, priceResults) => {
            if (err) {
                console.error('查询设备租金失败:', err);
                return res.status(500).json({ success: false, message: '查询设备租金失败' });
            }

            // 计算总金额
            let totalAmount = 0;
            const enrichedDeviceItems = deviceItems.map(item => {
                const priceInfo = priceResults.find(p => p.id == item.deviceId);
                const monthlyRate = priceInfo ? parseFloat(priceInfo.rental_price_per_month) : 0;
                const dailyRate = priceInfo ? parseFloat(priceInfo.rental_price_per_day) : 0;
                totalAmount += monthlyRate;
                return {
                    ...item,
                    monthlyRate: monthlyRate,
                    dailyRate: dailyRate
                };
            });

            // 开始事务
            db.beginTransaction(err => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ success: false, message: '事务启动失败' });
                }

                // 插入租赁订单
                const orderQuery = `
                    INSERT INTO rental_orders (
                        order_number, customer_id, order_date, start_date, end_date,
                        payment_cycle, total_amount, notes, salesperson_id, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                `;

                const orderValues = [
                    orderNumber,
                    customerId,
                    orderDate,
                    startDate,
                    endDate || null,
                    paymentCycle,
                    totalAmount,
                    notes || '',
                    user.id
                ];

                db.query(orderQuery, orderValues, (err, result) => {
                    if (err) {
                        console.error('创建订单失败:', err);
                        return db.rollback(() => {
                            res.status(500).json({ success: false, message: '创建订单失败: ' + err.message });
                        });
                    }

                    console.log('✓ 订单创建成功, ID:', result.insertId);
                    const orderId = result.insertId;

                    // 插入租赁订单项
                    let completedItems = 0;
                    const totalItems = enrichedDeviceItems.length;

                    enrichedDeviceItems.forEach((item, index) => {
                        const itemQuery = `
                            INSERT INTO rental_order_items (
                                order_id, device_id, device_code, specifications, quantity,
                                daily_rate, monthly_rate, start_date, end_date
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `;

                        const itemValues = [
                            orderId,
                            item.deviceId,
                            item.deviceCode,
                            item.specifications,
                            item.quantity || 1,
                            item.dailyRate,
                            item.monthlyRate,
                            startDate,
                            endDate || null
                        ];

                        db.query(itemQuery, itemValues, (err) => {
                            if (err) {
                                console.error('插入订单项失败:', err);
                                return db.rollback(() => {
                                    res.status(500).json({ success: false, message: '插入订单项失败: ' + err.message });
                                });
                            }

                            console.log(`✓ 订单项 ${index + 1} 插入成功`);

                            // 更新设备状态
                            db.query('UPDATE devices SET status = "rented" WHERE id = ?', [item.deviceId], (err) => {
                                if (err) {
                                    console.error('更新设备状态失败:', err);
                                    return db.rollback(() => {
                                        res.status(500).json({ success: false, message: '更新设备状态失败: ' + err.message });
                                    });
                                }

                                console.log(`✓ 设备 ${item.deviceId} 状态已更新为已出租`);

                                completedItems++;
                                if (completedItems === totalItems) {
                                    db.commit(err => {
                                        if (err) {
                                            return db.rollback(() => {
                                                res.status(500).json({ success: false, message: '事务提交失败' });
                                            });
                                        }

                                        console.log('✓ 订单创建成功，订单ID:', orderId);
                                        res.json({ success: true, message: '租赁订单创建成功', orderId: orderId });
                                    });
                                }
                            });
                        });
                    });
                });
            });
        });
    });
});

// 设备报废页面
app.get('/devices/scrap/:deviceCode', isAuthenticated, (req, res) => {
    const deviceCode = req.params.deviceCode;

    db.query(`
        SELECT d.*, p.name as product_name, p.model_number as product_specifications
        FROM devices d
        LEFT JOIN products p ON d.product_id = p.id
        WHERE d.device_code = ?
    `, [deviceCode], (err, devices) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }

        if (!devices || devices.length === 0) {
            return res.status(404).send('设备不存在');
        }

        const device = devices[0];

        if (device.status === 'rented') {
            return res.status(400).send('设备已租出，不能直接报废，请先完成退租');
        }

        db.query(`
            SELECT 
                da.id AS assembly_id,
                da.accessory_id,
                da.accessory_name,
                da.brand,
                da.model,
                da.quantity,
                da.batch_stock_id,
                da.unique_batch_id,
                COALESCE(da.purchase_price, abs.purchase_price, a.purchase_price) AS purchase_price,
                ac.name AS category_name,
                abs.unique_id AS batch_unique_id,
                abs.status AS batch_status
            FROM device_assemblies da
            LEFT JOIN accessories a ON da.accessory_id = a.id
            LEFT JOIN accessory_categories ac ON a.category_id = ac.id
            LEFT JOIN accessory_batch_stock abs ON da.batch_stock_id = abs.id
            WHERE da.device_id = ?
            ORDER BY ac.name, da.id
        `, [device.id], (err2, assemblies) => {
            if (err2) {
                console.error(err2);
                return res.status(500).send('服务器错误');
            }

            res.render('devices/scrap', {
                device: device,
                assemblies: assemblies || [],
                user: req.session.user,
                moment: moment,
                active: 'devices',
                pageTitle: '设备报废 - ' + deviceCode
            });
        });
    });
});

// 处理设备报废提交
app.post('/devices/scrap/:deviceCode', isAuthenticated, (req, res) => {
    const deviceCode = req.params.deviceCode;
    let scrapAssemblyIds = req.body.scrapAssemblyIds || [];

    if (!Array.isArray(scrapAssemblyIds)) {
        scrapAssemblyIds = [scrapAssemblyIds];
    }

    const scrapIdSet = new Set(
        scrapAssemblyIds
            .map((id) => parseInt(id, 10))
            .filter((id) => !Number.isNaN(id))
    );

    db.query(
        `SELECT d.* FROM devices d WHERE d.device_code = ?`,
        [deviceCode],
        (err, devices) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }

            if (!devices || devices.length === 0) {
                return res.status(404).send('设备不存在');
            }

            const device = devices[0];

            if (device.status === 'rented') {
                return res.status(400).send('设备已租出，不能直接报废，请先完成退租');
            }

            db.beginTransaction((txErr) => {
                if (txErr) {
                    console.error(txErr);
                    return res.status(500).send('服务器错误');
                }

                db.query(
                    `
                    SELECT 
                        da.id AS assembly_id,
                        da.accessory_id,
                        da.quantity,
                        da.batch_stock_id,
                        abs.used_quantity,
                        abs.quantity AS batch_quantity,
                        abs.purchase_price
                    FROM device_assemblies da
                    LEFT JOIN accessory_batch_stock abs ON da.batch_stock_id = abs.id
                    WHERE da.device_id = ?
                `,
                    [device.id],
                    (err2, assemblies) => {
                        if (err2) {
                            console.error(err2);
                            return db.rollback(() => {
                                res.status(500).send('服务器错误');
                            });
                        }

                        const allAssemblies = Array.isArray(assemblies) ? assemblies : [];
                        const returnAssemblies = allAssemblies.filter(
                            (row) => !scrapIdSet.has(row.assembly_id)
                        );
                        const scrapAssemblies = allAssemblies.filter(
                            (row) => scrapIdSet.has(row.assembly_id)
                        );

                        const batchBasedAccessoryIds = new Set();
                        const legacyAccessoryIds = new Set();
                        const tasks = [];

                        // 处理勾选报废的配件：记录报废信息并释放批次占用
                        scrapAssemblies.forEach((row) => {
                            const quantity = row.quantity || 0;
                            
                            if (!quantity || quantity <= 0) {
                                return;
                            }

                            // 记录报废信息到 accessory_scrap_records
                            tasks.push(
                                new Promise((resolve, reject) => {
                                    db.query(
                                        `INSERT INTO accessory_scrap_records 
                                         (accessory_id, batch_stock_id, device_id, device_code, quantity, purchase_price, scrap_reason, created_by) 
                                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                        [
                                            row.accessory_id,
                                            row.batch_stock_id,
                                            device.id,
                                            device.device_code,
                                            quantity,
                                            row.purchase_price,
                                            '设备报废',
                                            req.session.user ? req.session.user.id : null
                                        ],
                                        (insertErr) => {
                                            if (insertErr) {
                                                console.error('插入报废记录失败:', insertErr);
                                                return reject(insertErr);
                                            }
                                            console.log(`已记录配件报废: accessory_id=${row.accessory_id}, quantity=${quantity}`);
                                            resolve();
                                        }
                                    );
                                })
                            );

                            // 如果有批次ID，减少 used_quantity 并增加 scrapped_quantity（quantity保持不变，是历史采购事实）
                            if (row.batch_stock_id) {
                                tasks.push(
                                    new Promise((resolve, reject) => {
                                        const currentUsed = row.used_quantity || 0;
                                        
                                        let newUsed = currentUsed - quantity;
                                        if (newUsed < 0) newUsed = 0;

                                        db.query(
                                            `UPDATE accessory_batch_stock 
                                             SET used_quantity = ?, 
                                                 scrapped_quantity = scrapped_quantity + ?,
                                                 status = CASE 
                                                     WHEN ? > 0 THEN 'in_use'
                                                     WHEN quantity - ? - scrapped_quantity - ? <= 0 THEN 'exhausted'
                                                     ELSE 'in_stock'
                                                 END,
                                                 updated_at = CURRENT_TIMESTAMP 
                                             WHERE id = ?`,
                                            [newUsed, quantity, newUsed, newUsed, quantity, row.batch_stock_id],
                                            (updateErr) => {
                                                if (updateErr) {
                                                    console.error('更新批次库存失败:', updateErr);
                                                    return reject(updateErr);
                                                }
                                                console.log(`批次 ${row.batch_stock_id} 报废: used_quantity ${currentUsed}->${newUsed}, scrapped_quantity +${quantity}`);
                                                resolve();
                                            }
                                        );
                                    })
                                );
                            }
                        });

                        // 删除报废配件的 device_assemblies 记录
                        const scrapIds = scrapAssemblies.map((row) => row.assembly_id);
                        if (scrapIds.length > 0) {
                            tasks.push(
                                new Promise((resolve, reject) => {
                                    db.query(
                                        'DELETE FROM device_assemblies WHERE id IN (?)',
                                        [scrapIds],
                                        (deleteErr) => {
                                            if (deleteErr) {
                                                console.error('删除报废配件记录失败:', deleteErr);
                                                return reject(deleteErr);
                                            }
                                            resolve();
                                        }
                                    );
                                })
                            );
                        }

                        // 退回未勾选配件到库存/批次
                        returnAssemblies.forEach((row) => {
                            if (row.batch_stock_id && row.accessory_id) {
                                batchBasedAccessoryIds.add(row.accessory_id);
                            } else if (!row.batch_stock_id && row.accessory_id) {
                                legacyAccessoryIds.add(row.accessory_id);
                            }

                            tasks.push(
                                new Promise((resolve, reject) => {
                                    const quantity = row.quantity || 0;

                                    if (!quantity || quantity <= 0) {
                                        return resolve();
                                    }

                                    if (row.batch_stock_id) {
                                        const currentUsed = row.used_quantity || 0;
                                        let newUsed = currentUsed - quantity;
                                        if (newUsed < 0) {
                                            newUsed = 0;
                                        }

                                        const newStatus = newUsed > 0 ? 'in_use' : 'in_stock';

                                        db.query(
                                            `UPDATE accessory_batch_stock 
                                             SET used_quantity = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
                                             WHERE id = ?`,
                                            [newUsed, newStatus, row.batch_stock_id],
                                            (updateErr) => {
                                                if (updateErr) {
                                                    console.error('更新批次库存失败:', updateErr);
                                                    return reject(updateErr);
                                                }
                                                resolve();
                                            }
                                        );
                                    } else if (row.accessory_id) {
                                        db.query(
                                            `UPDATE accessories 
                                             SET stock_quantity = stock_quantity + ?, 
                                                 status = CASE 
                                                     WHEN stock_quantity + ? > 0 THEN 'in_warehouse' 
                                                     ELSE status 
                                                 END,
                                                 updated_at = CURRENT_TIMESTAMP
                                             WHERE id = ?`,
                                            [quantity, quantity, row.accessory_id],
                                            (updateErr) => {
                                                if (updateErr) {
                                                    console.error('更新配件库存失败:', updateErr);
                                                    return reject(updateErr);
                                                }
                                                resolve();
                                            }
                                        );
                                    } else {
                                        resolve();
                                    }
                                })
                            );
                        });

                        // 删除已退回的 device_assemblies 记录
                        const returnIds = returnAssemblies.map((row) => row.assembly_id);
                        if (returnIds.length > 0) {
                            tasks.push(
                                new Promise((resolve, reject) => {
                                    db.query(
                                        'DELETE FROM device_assemblies WHERE id IN (?)',
                                        [returnIds],
                                        (deleteErr) => {
                                            if (deleteErr) {
                                                console.error('删除设备配件记录失败:', deleteErr);
                                                return reject(deleteErr);
                                            }
                                            resolve();
                                        }
                                    );
                                })
                            );
                        }

                        Promise.all(tasks)
                            .then(() => {
                                const syncTasks = [];

                                // 同步基于批次的配件总库存到 accessories.stock_quantity
                                batchBasedAccessoryIds.forEach((accessoryId) => {
                                    syncTasks.push(
                                        new Promise((resolve, reject) => {
                                            db.query(
                                                `
                                                SELECT COALESCE(SUM(available_quantity), 0) AS total_available
                                                FROM accessory_batch_stock
                                                WHERE accessory_id = ?
                                            `,
                                                [accessoryId],
                                                (sumErr, rows) => {
                                                    if (sumErr) {
                                                        console.error('查询批次可用库存失败:', sumErr);
                                                        return reject(sumErr);
                                                    }

                                                    const totalAvailable =
                                                        (rows && rows[0] && rows[0].total_available) || 0;

                                                    db.query(
                                                        `
                                                        UPDATE accessories
                                                        SET stock_quantity = ?, 
                                                            status = CASE 
                                                                WHEN ? > 0 AND status != 'scrapped' THEN 'in_warehouse'
                                                                ELSE status
                                                            END,
                                                            updated_at = CURRENT_TIMESTAMP
                                                        WHERE id = ?
                                                    `,
                                                        [totalAvailable, totalAvailable, accessoryId],
                                                        (updateErr) => {
                                                            if (updateErr) {
                                                                console.error('同步配件总库存失败:', updateErr);
                                                                return reject(updateErr);
                                                            }
                                                            resolve();
                                                        }
                                                    );
                                                }
                                            );
                                        })
                                    );
                                });

                                Promise.all(syncTasks)
                                    .then(() => {
                                        db.query(
                                            "UPDATE devices SET status = 'retired', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                                            [device.id],
                                            (updateDeviceErr) => {
                                                if (updateDeviceErr) {
                                                    console.error('更新设备状态失败:', updateDeviceErr);
                                                    return db.rollback(() => {
                                                        res.status(500).send('服务器错误');
                                                    });
                                                }

                                                db.commit((commitErr) => {
                                                    if (commitErr) {
                                                        console.error('提交事务失败:', commitErr);
                                                        return db.rollback(() => {
                                                            res.status(500).send('服务器错误');
                                                        });
                                                    }

                                                    if (
                                                        req.xhr ||
                                                        (req.headers.accept &&
                                                            req.headers.accept.indexOf('application/json') !== -1)
                                                    ) {
                                                        return res.json({
                                                            success: true,
                                                            message: '设备报废完成',
                                                        });
                                                    }

                                                    req.session.successMessage = '设备报废完成';
                                                    res.redirect('/devices');
                                                });
                                            }
                                        );
                                    })
                                    .catch((syncErr) => {
                                        console.error('同步配件库存失败:', syncErr);
                                        db.rollback(() => {
                                            res.status(500).send('服务器错误');
                                        });
                                    });
                            })
                            .catch((allErr) => {
                                console.error('设备报废事务失败:', allErr);
                                db.rollback(() => {
                                    res.status(500).send('服务器错误');
                                });
                            });
                    }
                );
            });
        }
    );
});

// 生成设备二维码 JSON（保留给以后可能用的接口）
app.get('/devices/:deviceCode/qrcode', isAuthenticated, (req, res) => {
    const deviceCode = req.params.deviceCode;

    db.query('SELECT id FROM devices WHERE device_code = ? LIMIT 1', [deviceCode], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }

        if (!results || results.length === 0) {
            return res.status(404).send('设备不存在');
        }

        getExternalBaseUrl((_, baseUrl) => {
            const normalizedBase = (baseUrl || '').replace(/\/+$/, '');
            const targetUrl = `${normalizedBase}/wechat/device/${encodeURIComponent(deviceCode)}`;

            QRCode.toDataURL(targetUrl, { width: 256 }, (qrErr, url) => {
                if (qrErr) {
                    console.error(qrErr);
                    return res.status(500).send('二维码生成失败');
                }

                res.json({
                    success: true,
                    qrcodeDataUrl: url,
                    targetUrl: targetUrl
                });
            });
        });
    });
});

// 设备二维码展示页面（PC 端查看和给手机扫码用）
app.get('/devices/qrcode/:deviceCode', isAuthenticated, (req, res) => {
    const deviceCode = req.params.deviceCode;

    db.query(`
        SELECT d.*, p.name as product_name, p.model_number as product_specifications
        FROM devices d
        LEFT JOIN products p ON d.product_id = p.id
        WHERE d.device_code = ?
    `, [deviceCode], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }

        if (!results || results.length === 0) {
            return res.status(404).send('设备不存在');
        }

        const device = results[0];

        getExternalBaseUrl((_, baseUrl) => {
            const normalizedBase = (baseUrl || '').replace(/\/+$/, '');
            const targetUrl = `${normalizedBase}/wechat/device/${encodeURIComponent(deviceCode)}`;

            QRCode.toDataURL(targetUrl, { width: 260 }, (qrErr, url) => {
                if (qrErr) {
                    console.error(qrErr);
                    return res.status(500).send('二维码生成失败');
                }

                res.render('devices/qrcode', {
                    device: device,
                    qrcodeDataUrl: url,
                    targetUrl: targetUrl,
                    user: req.session.user,
                    active: 'devices',
                    pageTitle: '设备微信二维码'
                });
            });
        });
    });
});

// ========================= 采购管理路由 =========================

// 采购管理主页
app.get('/purchases', isAuthenticated, (req, res) => {
    // 获取查询参数
    const search = req.query.search || '';
    const supplier = req.query.supplier || '';
    const status = req.query.status || '';
    const sortBy = req.query.sort || 'pb.created_at';
    const sortOrder = req.query.order || 'desc';
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // 每页显示数量
    const offset = (page - 1) * limit;
    
    // 添加调试日志
    console.log('Purchase search parameters:', {
        search: search,
        supplier: supplier,
        status: status,
        sortBy: sortBy,
        sortOrder: sortOrder,
        page: page
    });
    
    // 构建查询条件
    let whereConditions = [];
    let queryParams = [];
    
    if (search) {
        whereConditions.push('(pb.batch_no LIKE ? OR s.name LIKE ? OR EXISTS (SELECT 1 FROM purchase_accessory_items pai JOIN accessories a ON pai.accessory_id = a.id WHERE pai.batch_id = pb.id AND a.name LIKE ?))');
        queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (supplier) {
        whereConditions.push('pb.supplier_id = ?');
        queryParams.push(supplier);
    }
    
    if (status) {
        whereConditions.push('pb.status = ?');
        queryParams.push(status);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // 构建排序条件
    const validSortColumns = {
        'batch_no': 'pb.batch_no',
        'supplier_name': 's.name',
        'purchase_date': 'pb.purchase_date',
        'total_amount': 'pb.total_amount',
        'expected_delivery_date': 'pb.expected_delivery_date',
        'pb.created_at': 'pb.created_at'
    };
    
    const orderColumn = validSortColumns[sortBy] || 'pb.created_at';
    const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const orderClause = `ORDER BY ${orderColumn} ${orderDirection}`;
    
    // 查询数据
    const query = `
        SELECT 
            pb.*, 
            s.name as supplier_name, 
            u.real_name as created_by_name,
            (
                SELECT GROUP_CONCAT(a.name SEPARATOR '，')
                FROM purchase_accessory_items pai
                JOIN accessories a ON pai.accessory_id = a.id
                WHERE pai.batch_id = pb.id
            ) AS accessory_names,
            (
                SELECT IFNULL(SUM(pai.quantity), 0)
                FROM purchase_accessory_items pai
                WHERE pai.batch_id = pb.id
            ) AS accessory_quantity
        FROM purchase_batches pb
        LEFT JOIN suppliers s ON pb.supplier_id = s.id
        LEFT JOIN users u ON pb.created_by = u.id
        ${whereClause}
        ${orderClause}
        LIMIT ? OFFSET ?
    `;
    
    // 查询总数
    const countQuery = `
        SELECT COUNT(DISTINCT pb.id) as total
        FROM purchase_batches pb
        LEFT JOIN suppliers s ON pb.supplier_id = s.id
        LEFT JOIN users u ON pb.created_by = u.id
        LEFT JOIN purchase_accessory_items pai ON pb.id = pai.batch_id
        LEFT JOIN accessories a ON pai.accessory_id = a.id
        ${whereClause}
    `;
    
    // 获取供应商列表
    db.query('SELECT * FROM suppliers ORDER BY name', (err, suppliers) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 执行主查询
        db.query(query, [...queryParams, limit, offset], (err, batches) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            // 执行计数查询
            db.query(countQuery, queryParams, (err, countResult) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器错误');
                }
                
                const totalItems = countResult[0].total;
                const totalPages = Math.ceil(totalItems / limit);
                
                res.render('purchases/index', {
                    batches: batches,
                    suppliers: suppliers,
                    user: req.session.user,
                    moment: moment,
                    active: 'purchases',
                    pageTitle: '采购管理',
                    // 传递筛选参数，便于前端显示当前筛选状态
                    selectedSupplierId: supplier,
                    selectedStatus: status,
                    selectedSortBy: sortBy,
                    selectedSortOrder: sortOrder,
                    searchKeyword: search,
                    // 分页参数
                    currentPage: page,
                    totalPages: totalPages,
                    // 统计数据
                    totalStats: {
                        totalBatches: totalItems,
                        monthlyAmount: 0, // 这里可以添加月度统计
                        pendingBatches: 0, // 这里可以添加待审批统计
                        notDeliveredBatches: 0 // 这里可以添加未到货统计
                    }
                });
            });
        });
    });
});

// 新建采购页面
app.get('/purchases/add', isAuthenticated, (req, res) => {
    db.query('SELECT * FROM suppliers ORDER BY name', (err, suppliers) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 生成批次号
        const today = moment().format('YYYYMMDD');
        db.query(`
            SELECT batch_no FROM purchase_batches 
            WHERE batch_no LIKE 'PO${today}%' 
            ORDER BY batch_no DESC LIMIT 1
        `, (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            let nextSeq = '001';
            if (result.length > 0) {
                const lastBatchNo = result[0].batch_no;
                const lastSeq = parseInt(lastBatchNo.substring(10)) || 0;
                nextSeq = String(lastSeq + 1).padStart(3, '0');
            }
            
            const batchNo = `PO${today}${nextSeq}`;
            
            // 查询最近一次采购配件的采购日期
            const lastAccessoryPurchaseSql = `
                SELECT MAX(pb.purchase_date) AS last_accessory_purchase_date
                FROM purchase_batches pb
                JOIN purchase_accessory_items pai ON pai.batch_id = pb.id
            `;

            db.query(lastAccessoryPurchaseSql, (lastErr, lastRows) => {
                if (lastErr) {
                    console.error(lastErr);
                    return res.status(500).send('服务器错误');
                }

                const lastAccessoryPurchaseDate = (lastRows && lastRows[0]) ? lastRows[0].last_accessory_purchase_date : null;

                res.render('purchases/add', {
                    batchNo: batchNo,
                    suppliers: suppliers,
                    lastAccessoryPurchaseDate: lastAccessoryPurchaseDate,
                    user: req.session.user,
                    moment: moment,
                    active: 'purchases',
                    pageTitle: '新建采购'
                });
            });
        });
    });
});

// 提交新建采购
app.post('/purchases/add', isAuthenticated, (req, res) => {
    let {
        batchNo,
        supplierId,
        purchaseDate,
        expectedDeliveryDate,
        notes,
        itemType,
        itemId,
        itemName,
        itemPrice,
        itemQuantity,
        itemNotes
    } = req.body;
    
    if (!batchNo) {
        const autoBatchTime = moment().format('YYYYMMDDHHmmss');
        batchNo = `PO${autoBatchTime}`;
    }
    
    if (!supplierId || !purchaseDate) {
        return res.status(400).json({ success: false, message: '请填写必要信息' });
    }
    
    // 验证采购项目
    let hasItems = false;
    for (let key in itemType) {
        if (itemType[key] && itemId[key] && parseFloat(itemPrice[key]) > 0 && parseInt(itemQuantity[key]) > 0) {
            hasItems = true;
            break;
        }
    }
    
    if (!hasItems) {
        return res.status(400).json({ success: false, message: '请至少添加一个有效的采购项目' });
    }
    
    // 计算总金额
    let totalAmount = 0;
    for (let key in itemType) {
        if (itemType[key]) {
            totalAmount += parseFloat(itemPrice[key]) * parseInt(itemQuantity[key]);
        }
    }
    
    db.beginTransaction(err => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '事务启动失败' });
        }
        
        // 插入采购批次
        db.query(`
            INSERT INTO purchase_batches (
                batch_no, supplier_id, purchase_date, expected_delivery_date, 
                total_amount, notes, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            batchNo, supplierId, purchaseDate, expectedDeliveryDate || null,
            totalAmount, notes || '', req.session.user.id
        ], (err, result) => {
            if (err) {
                console.error(err);
                return db.rollback(() => {
                    res.status(500).json({ success: false, message: '创建采购批次失败' });
                });
            }
            
            const batchId = result.insertId;
            let itemCount = 0;
            const itemCountToProcess = Object.keys(itemType).length;
            
            // 插入采购项目
            for (let key in itemType) {
                if (!itemType[key] || !itemId[key] || parseFloat(itemPrice[key]) <= 0 || parseInt(itemQuantity[key]) <= 0) {
                    itemCount++;
                    if (itemCount === itemCountToProcess) {
                        // 插入审批记录
                        db.query(`
                            INSERT INTO purchase_approvals (
                                batch_id, approval_type, approver_id, approval_status, approval_date
                            ) VALUES (?, 'approve', ?, 'pending', NULL)
                        `, [batchId, req.session.user.id], (err) => {
                            if (err) {
                                console.error(err);
                            }
                            
                            db.commit(err => {
                                if (err) {
                                    return db.rollback(() => {
                                        res.status(500).json({ success: false, message: '事务提交失败' });
                                    });
                                }
                                
                                res.json({ 
                                    success: true, 
                                    message: '采购批次创建成功',
                                    batchId: batchId
                                });
                            });
                        });
                    }
                    continue;
                }
                
                const totalPrice = parseFloat(itemPrice[key]) * parseInt(itemQuantity[key]);
                
                if (itemType[key] === 'accessory') {
                    // 插入配件采购项
                    db.query(`
                        INSERT INTO purchase_accessory_items (
                            batch_id, accessory_id, quantity, unit_price, 
                            total_price, notes
                        ) VALUES (?, ?, ?, ?, ?, ?)
                    `, [
                        batchId, itemId[key], itemQuantity[key], itemPrice[key],
                        totalPrice, itemNotes[key] || ''
                    ], (err) => {
                        if (err) {
                            console.error(err);
                        }
                        
                        itemCount++;
                        if (itemCount === itemCountToProcess) {
                            // 插入审批记录
                            db.query(`
                                INSERT INTO purchase_approvals (
                                    batch_id, approval_type, approver_id, approval_status, approval_date
                                ) VALUES (?, 'approve', ?, 'pending', NULL)
                            `, [batchId, req.session.user.id], (err) => {
                                if (err) {
                                    console.error(err);
                                }
                                
                                db.commit(err => {
                                    if (err) {
                                        return db.rollback(() => {
                                            res.status(500).json({ success: false, message: '事务提交失败' });
                                        });
                                    }
                                    
                                    res.json({ 
                                        success: true, 
                                        message: '采购批次创建成功',
                                        batchId: batchId
                                    });
                                });
                            });
                        }
                    });
                } else if (itemType[key] === 'device') {
                    // 插入设备采购项
                    db.query(`
                        INSERT INTO purchase_device_items (
                            batch_id, product_id, quantity, unit_price, 
                            total_price, notes
                        ) VALUES (?, ?, ?, ?, ?, ?)
                    `, [
                        batchId, itemId[key], itemQuantity[key], itemPrice[key],
                        totalPrice, itemNotes[key] || ''
                    ], (err) => {
                        if (err) {
                            console.error(err);
                        }
                        
                        itemCount++;
                        if (itemCount === itemCountToProcess) {
                            // 插入审批记录
                            db.query(`
                                INSERT INTO purchase_approvals (
                                    batch_id, approval_type, approver_id, approval_status, approval_date
                                ) VALUES (?, 'approve', ?, 'pending', NULL)
                            `, [batchId, req.session.user.id], (err) => {
                                if (err) {
                                    console.error(err);
                                }
                                
                                db.commit(err => {
                                    if (err) {
                                        return db.rollback(() => {
                                            res.status(500).json({ success: false, message: '事务提交失败' });
                                        });
                                    }
                                    
                                    res.json({ 
                                        success: true, 
                                        message: '采购批次创建成功',
                                        batchId: batchId
                                    });
                                });
                            });
                        }
                    });
                }
            }
        });
    });
});

// 查看采购详情
app.get('/purchases/view/:id', isAuthenticated, (req, res) => {
    const batchId = req.params.id;
    
    // 获取批次基本信息
    db.query(`
        SELECT pb.*, s.name as supplier_name, u.real_name as created_by_name
        FROM purchase_batches pb
        LEFT JOIN suppliers s ON pb.supplier_id = s.id
        LEFT JOIN users u ON pb.created_by = u.id
        WHERE pb.id = ?
    `, [batchId], (err, batchResult) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        if (batchResult.length === 0) {
            return res.status(404).send('采购批次不存在');
        }
        
        const batch = batchResult[0];
        
        // 获取配件采购项
        db.query(`
            SELECT pai.*, a.name, a.brand, a.model
            FROM purchase_accessory_items pai
            LEFT JOIN accessories a ON pai.accessory_id = a.id
            WHERE pai.batch_id = ?
        `, [batchId], (err, accessoryResult) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            // 获取设备采购项
            db.query(`
                SELECT pdi.*, p.name, p.brand, p.model
                FROM purchase_device_items pdi
                LEFT JOIN products p ON pdi.product_id = p.id
                WHERE pdi.batch_id = ?
            `, [batchId], (err, deviceResult) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器错误');
                }
                
                // 获取审批记录
                db.query(`
                    SELECT pa.*, u.real_name as approver_name
                    FROM purchase_approvals pa
                    LEFT JOIN users u ON pa.approver_id = u.id
                    WHERE pa.batch_id = ?
                    ORDER BY pa.created_at DESC
                `, [batchId], (err, approvalResult) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('服务器错误');
                    }
                    
                    res.render('purchases/view', {
                        batch: batch,
                        accessories: accessoryResult,
                        devices: deviceResult,
                        approvals: approvalResult,
                        user: req.session.user,
                        moment: moment,
                        active: 'purchases',
                        pageTitle: '采购详情'
                    });
                });
            });
        });
    });
});

// 采购记录查询页面
app.get('/purchases/records', isAuthenticated, (req, res) => {
    // 获取查询参数
    const {
        batchNo,
        supplierId,
        status,
        paymentStatus,
        dateRange,
        page = 1
    } = req.query;
    
    const limit = 10;
    const offset = (page - 1) * limit;
    
    // 构建查询条件
    let whereConditions = [];
    let queryParams = [];
    
    if (batchNo) {
        whereConditions.push('pb.batch_no LIKE ?');
        queryParams.push(`%${batchNo}%`);
    }
    
    if (supplierId) {
        whereConditions.push('pb.supplier_id = ?');
        queryParams.push(supplierId);
    }
    
    if (status) {
        whereConditions.push('pb.status = ?');
        queryParams.push(status);
    }
    
    if (paymentStatus) {
        if (paymentStatus === 'unpaid') {
            whereConditions.push('pb.paid_amount <= 0');
        } else if (paymentStatus === 'paid') {
            whereConditions.push('pb.paid_amount >= pb.total_amount');
        } else if (paymentStatus === 'partial') {
            whereConditions.push('pb.paid_amount > 0 AND pb.paid_amount < pb.total_amount');
        }
    }
    
    if (dateRange) {
        let startDate;
        const today = moment().startOf('day');
        
        switch (dateRange) {
            case 'today':
                startDate = today;
                break;
            case 'week':
                startDate = moment().startOf('week');
                break;
            case 'month':
                startDate = moment().startOf('month');
                break;
            case 'quarter':
                startDate = moment().startOf('quarter');
                break;
            case 'year':
                startDate = moment().startOf('year');
                break;
        }
        
        if (startDate) {
            whereConditions.push('pb.purchase_date >= ?');
            queryParams.push(startDate.format('YYYY-MM-DD'));
        }
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // 获取供应商列表（用于筛选）
    db.query('SELECT * FROM suppliers ORDER BY name', (err, suppliers) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 获取总数
        db.query(`
            SELECT COUNT(*) as total FROM purchase_batches pb
            ${whereClause}
        `, queryParams, (err, countResult) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            const totalRecords = countResult[0].total;
            const totalPages = Math.ceil(totalRecords / limit);
            
            // 获取分页数据
            db.query(`
                SELECT pb.*, s.name as supplier_name, u.real_name as created_by_name
                FROM purchase_batches pb
                LEFT JOIN suppliers s ON pb.supplier_id = s.id
                LEFT JOIN users u ON pb.created_by = u.id
                ${whereClause}
                ORDER BY pb.created_at DESC
                LIMIT ? OFFSET ?
            `, [...queryParams, limit, offset], (err, batches) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器错误');
                }
                
                const startRecord = totalRecords > 0 ? offset + 1 : 0;
                const endRecord = Math.min(offset + limit, totalRecords);
                
                res.render('purchases/records', {
                    batches: batches,
                    suppliers: suppliers,
                    currentPage: parseInt(page),
                    totalPages: totalPages,
                    totalRecords: totalRecords,
                    startRecord: startRecord,
                    endRecord: endRecord,
                    user: req.session.user,
                    moment: moment,
                    active: 'purchases',
                    pageTitle: '采购记录'
                });
            });
        });
    });
});

// 删除采购批次
app.post('/purchases/delete/:id', isAuthenticated, (req, res) => {
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'finance') {
        return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    const batchId = req.params.id;
    
    db.beginTransaction(err => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '事务启动失败' });
        }
        
        // 检查批次状态
        db.query(`
            SELECT status FROM purchase_batches WHERE id = ?
        `, [batchId], (err, batchResult) => {
            if (err) {
                console.error(err);
                return db.rollback(() => {
                    res.status(500).json({ success: false, message: '查询批次失败' });
                });
            }
            
            if (batchResult.length === 0) {
                return db.rollback(() => {
                    res.status(404).json({ success: false, message: '采购批次不存在' });
                });
            }
            
            const batchStatus = batchResult[0].status;
            
            // 只有待审批的批次才能删除
            if (batchStatus !== 'pending') {
                return db.rollback(() => {
                    res.status(400).json({ success: false, message: '只有待审批的采购批次才能删除' });
                });
            }
            
            // 删除配件采购项
            db.query(`
                DELETE FROM purchase_accessory_items WHERE batch_id = ?
            `, [batchId], (err) => {
                if (err) {
                    console.error(err);
                    return db.rollback(() => {
                        res.status(500).json({ success: false, message: '删除配件采购项失败' });
                    });
                }
                
                // 删除设备采购项
                db.query(`
                    DELETE FROM purchase_device_items WHERE batch_id = ?
                `, [batchId], (err) => {
                    if (err) {
                        console.error(err);
                        return db.rollback(() => {
                            res.status(500).json({ success: false, message: '删除设备采购项失败' });
                        });
                    }
                    
                    // 删除审批记录
                    db.query(`
                        DELETE FROM purchase_approvals WHERE batch_id = ?
                    `, [batchId], (err) => {
                        if (err) {
                            console.error(err);
                            return db.rollback(() => {
                                res.status(500).json({ success: false, message: '删除审批记录失败' });
                            });
                        }
                        
                        // 删除批次记录
                        db.query(`
                            DELETE FROM purchase_batches WHERE id = ?
                        `, [batchId], (err) => {
                            if (err) {
                                console.error(err);
                                return db.rollback(() => {
                                    res.status(500).json({ success: false, message: '删除采购批次失败' });
                                });
                            }
                            
                            db.commit(err => {
                                if (err) {
                                    return db.rollback(() => {
                                        res.status(500).json({ success: false, message: '事务提交失败' });
                                    });
                                }
                                
                                res.json({ success: true, message: '删除采购批次成功' });
                            });
                        });
                    });
                });
            });
        });
    });
});

// 审批采购
app.post('/purchases/approve/:id', isAuthenticated, (req, res) => {
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'finance') {
        return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    const batchId = req.params.id;
    
    db.beginTransaction(err => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '事务启动失败' });
        }
        
        // 更新批次状态
        db.query(`
            UPDATE purchase_batches SET status = 'approved', updated_at = NOW()
            WHERE id = ? AND status = 'pending'
        `, [batchId], (err, result) => {
            if (err) {
                console.error(err);
                return db.rollback(() => {
                    res.status(500).json({ success: false, message: '更新批次状态失败' });
                });
            }
            
            if (result.affectedRows === 0) {
                return db.rollback(() => {
                    res.status(400).json({ success: false, message: '采购批次不存在或状态不正确' });
                });
            }
            
            // 更新审批记录
            db.query(`
                UPDATE purchase_approvals SET 
                    approval_status = 'approved', 
                    approval_date = NOW(),
                    updated_at = NOW()
                WHERE batch_id = ? AND approval_type = 'approve' AND approval_status = 'pending'
            `, [batchId], (err) => {
                if (err) {
                    console.error(err);
                    return db.rollback(() => {
                        res.status(500).json({ success: false, message: '更新审批记录失败' });
                    });
                }
                
                db.commit(err => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).json({ success: false, message: '事务提交失败' });
                        });
                    }
                    
                    res.json({ success: true, message: '审批成功' });
                });
            });
        });
    });
});

// 标记到货
app.post('/purchases/delivered/:id', isAuthenticated, (req, res) => {
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'finance') {
        return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    const batchId = req.params.id;
    
    db.query(`
        UPDATE purchase_batches SET status = 'delivered', updated_at = NOW()
        WHERE id = ? AND status = 'approved'
    `, [batchId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '更新批次状态失败' });
        }
        
        if (result.affectedRows === 0) {
            return res.status(400).json({ success: false, message: '采购批次不存在或状态不正确' });
        }
        
        // 插入审批记录（使用已有合法类型，避免枚举截断错误）
        db.query(`
            INSERT INTO purchase_approvals (
                batch_id, approval_type, approver_id, approval_status, approval_date
            ) VALUES (?, 'approve', ?, 'approved', NOW())
        `, [batchId, req.session.user.id], (err) => {
            if (err) {
                console.error(err);
            }
            
            res.json({ success: true, message: '标记到货成功' });
        });
    });
});

// 完成采购
app.post('/purchases/complete/:id', isAuthenticated, (req, res) => {
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'finance') {
        return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    const batchId = req.params.id;
    
    db.beginTransaction(err => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '事务启动失败' });
        }
        
        // 更新批次状态
        db.query(`
            UPDATE purchase_batches SET status = 'completed', updated_at = NOW()
            WHERE id = ? AND status = 'delivered'
        `, [batchId], (err, result) => {
            if (err) {
                console.error(err);
                return db.rollback(() => {
                    res.status(500).json({ success: false, message: '更新批次状态失败' });
                });
            }
            
            if (result.affectedRows === 0) {
                return db.rollback(() => {
                    res.status(400).json({ success: false, message: '采购批次不存在或状态不正确' });
                });
            }
            
            // 获取配件采购项并更新库存
            db.query(`
                SELECT accessory_id, quantity
                FROM purchase_accessory_items
                WHERE batch_id = ?
            `, [batchId], (err, accessoryItems) => {
                if (err) {
                    console.error(err);
                    return db.rollback(() => {
                        res.status(500).json({ success: false, message: '获取配件采购项失败' });
                    });
                }
                
                // 更新配件库存
                let accessoryUpdateCount = 0;
                const accessoryUpdateTotal = accessoryItems.length;
                
                if (accessoryUpdateTotal === 0) {
                    updateDeviceStock();
                    return;
                }
                
                accessoryItems.forEach(item => {
                    // 获取采购批次信息（包含batch_item_id）
                    db.query(`
                        SELECT pb.batch_no, pb.supplier_id, pb.purchase_date, 
                               pa.id as batch_item_id, pa.unit_price, 
                               a.name as accessory_name, ac.name as category_name
                        FROM purchase_batches pb
                        JOIN purchase_accessory_items pa ON pb.id = pa.batch_id
                        JOIN accessories a ON pa.accessory_id = a.id
                        LEFT JOIN accessory_categories ac ON a.category_id = ac.id
                        WHERE pb.id = ? AND pa.accessory_id = ?
                    `, [batchId, item.accessory_id], (err, batchInfo) => {
                        if (err) {
                            console.error(err);
                        } else if (batchInfo.length > 0) {
                            const batch = batchInfo[0];
                            const batchNumber = `${batch.batch_no}-ACC${item.accessory_id}`;
                            
                            // 生成批次唯一编号（类别前缀+配件ID-日期-批次号）
                            const purchaseDate = batch.purchase_date ? new Date(batch.purchase_date).toISOString().split('T')[0].replace(/-/g, '') : new Date().toISOString().split('T')[0].replace(/-/g, '');
                            const categoryPrefix = batch.category_name ? batch.category_name.substring(0, 3).toUpperCase() : 'ACC';
                            const uniqueBatchId = `${categoryPrefix}${item.accessory_id}-${purchaseDate}-${batchId}`;
                            
                            // 创建配件批次库存记录（新的批次库存表）
                            db.query(`
                                INSERT INTO accessory_batch_stock (
                                    unique_id, accessory_id, batch_id, batch_item_id,
                                    purchase_price, quantity, used_quantity
                                ) VALUES (?, ?, ?, ?, ?, ?, 0)
                            `, [
                                uniqueBatchId, item.accessory_id, batchId, batch.batch_item_id,
                                batch.unit_price, item.quantity
                            ], (err) => {
                                if (err) {
                                    console.error('创建配件批次库存记录失败:', err);
                                }
                            });
                            
                            // 创建配件批次记录（兼容旧表）
                            db.query(`
                                INSERT INTO accessory_batches (
                                    accessory_id, batch_number, purchase_price, purchase_date, 
                                    quantity, remaining_quantity, supplier_id, notes
                                ) VALUES (?, ?, ?, CURDATE(), ?, ?, ?, '采购批次')
                            `, [
                                item.accessory_id, batchNumber, batch.unit_price,
                                item.quantity, item.quantity, batch.supplier_id
                            ], (err) => {
                                if (err) {
                                    console.error('创建配件批次记录失败:', err);
                                }
                            });
                        }
                        
                        // 更新配件库存
                        db.query(`
                            UPDATE accessories
                            SET stock_quantity = stock_quantity + ?
                            WHERE id = ?
                        `, [item.quantity, item.accessory_id], (err) => {
                            if (err) {
                                console.error(err);
                            }
                            
                            accessoryUpdateCount++;
                            if (accessoryUpdateCount === accessoryUpdateTotal) {
                                updateDeviceStock();
                            }
                        });
                    });
                });
                
                function updateDeviceStock() {
                    // 获取设备采购项并更新库存
                    db.query(`
                        SELECT product_id, quantity
                        FROM purchase_device_items
                        WHERE batch_id = ?
                    `, [batchId], (err, deviceItems) => {
                        if (err) {
                            console.error(err);
                            return db.rollback(() => {
                                res.status(500).json({ success: false, message: '获取设备采购项失败' });
                            });
                        }
                        
                        // 更新设备库存
                        let deviceUpdateCount = 0;
                        const deviceUpdateTotal = deviceItems.length;
                        
                        if (deviceUpdateTotal === 0) {
                            insertApprovalRecord();
                            return;
                        }
                        
                        deviceItems.forEach(item => {
                            // 为每个采购的设备创建设备记录
                            // 生成设备编号：产品编码 + 批次号 + 序号
                            db.query(`
                                SELECT product_code FROM products WHERE id = ?
                            `, [item.product_id], (err, productResult) => {
                                if (err) {
                                    console.error(err);
                                } else if (productResult.length > 0) {
                                    const productCode = productResult[0].product_code || 'DEV';
                                    
                                    // 为每个设备创建记录
                                    for (let i = 0; i < item.quantity; i++) {
                                        const deviceCode = `${productCode}${batchId}${String(i + 1).padStart(3, '0')}`;
                                        const deviceName = `${productCode} 设备`;
                                        
                                        db.query(`
                                            INSERT INTO devices (
                                                product_id, device_code, device_name,
                                                status, created_at, updated_at
                                            ) VALUES (?, ?, ?, 'available', NOW(), NOW())
                                        `, [item.product_id, deviceCode, deviceName], (err) => {
                                            if (err) {
                                                console.error(err);
                                            }
                                        });
                                    }
                                }
                                
                                deviceUpdateCount++;
                                if (deviceUpdateCount === deviceUpdateTotal) {
                                    insertApprovalRecord();
                                }
                            });
                        });
                        
                        function insertApprovalRecord() {
                            // 插入审批记录
                            db.query(`
                                INSERT INTO purchase_approvals (
                                    batch_id, approval_type, approver_id, approval_status, approval_date
                                ) VALUES (?, 'complete', ?, 'approved', NOW())
                            `, [batchId, req.session.user.id], (err) => {
                                if (err) {
                                    console.error(err);
                                }
                                
                                db.commit(err => {
                                    if (err) {
                                        return db.rollback(() => {
                                            res.status(500).json({ success: false, message: '事务提交失败' });
                                        });
                                    }
                                    
                                    res.json({ success: true, message: '采购已完成，库存已更新' });
                                });
                            });
                        }
                    });
                }
            });
        });
    });
});

// 取消采购
app.post('/purchases/cancel/:id', isAuthenticated, (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    const batchId = req.params.id;
    
    db.query(`
        UPDATE purchase_batches SET status = 'cancelled', updated_at = NOW()
        WHERE id IN ('pending', 'approved')
    `, [batchId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '更新批次状态失败' });
        }
        
        if (result.affectedRows === 0) {
            return res.status(400).json({ success: false, message: '采购批次不存在或状态不正确' });
        }
        
        // 插入审批记录
        db.query(`
            INSERT INTO purchase_approvals (
                batch_id, approval_type, approver_id, approval_status, approval_date
            ) VALUES (?, 'cancel', ?, 'approved', NOW())
        `, [batchId, req.session.user.id], (err) => {
            if (err) {
                console.error(err);
            }
            
            res.json({ success: true, message: '采购已取消' });
        });
    });
});

// 支付款项
app.post('/purchases/payment/:id', isAuthenticated, (req, res) => {
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'finance') {
        return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    const batchId = req.params.id;
    const { amount, notes, finance_account_code } = req.body;
    
    if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ success: false, message: '请输入有效的支付金额' });
    }
    
    db.beginTransaction(err => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '事务启动失败' });
        }
        
        // 获取当前批次信息
        db.query(`
            SELECT * FROM purchase_batches WHERE id = ?
        `, [batchId], (err, result) => {
            if (err) {
                console.error(err);
                return db.rollback(() => {
                    res.status(500).json({ success: false, message: '查询批次信息失败' });
                });
            }
            
            if (result.length === 0) {
                return db.rollback(() => {
                    res.status(400).json({ success: false, message: '采购批次不存在' });
                });
            }
            
            const batch = result[0];
            const currentPaid = parseFloat(batch.paid_amount) || 0;
            const totalAmount = parseFloat(batch.total_amount) || 0;
            const paymentAmount = parseFloat(amount);
            const originalStatus = batch.status;
            
            if (currentPaid + paymentAmount > totalAmount) {
                return db.rollback(() => {
                    res.status(400).json({ success: false, message: '支付金额超过总金额' });
                });
            }
            
            // 更新已支付金额
            db.query(`
                UPDATE purchase_batches 
                SET paid_amount = ?, updated_at = NOW()
                WHERE id = ?
            `, [currentPaid + paymentAmount, batchId], (err) => {
                if (err) {
                    console.error(err);
                    return db.rollback(() => {
                        res.status(500).json({ success: false, message: '更新支付金额失败' });
                    });
                }
                
                // 插入审批记录
                db.query(`
                    INSERT INTO purchase_approvals (
                        batch_id, approval_type, approver_id, approval_status, 
                        approval_date, amount, notes
                    ) VALUES (?, 'payment', ?, 'approved', NOW(), ?, ?)
                `, [batchId, req.session.user.id, paymentAmount, notes || ''], (err) => {
                    if (err) {
                        console.error(err);
                        return db.rollback(() => {
                            res.status(500).json({ success: false, message: '插入审批记录失败' });
                        });
                    }

                    // 写入采购支出的财务流水记录
                    const accountCode = finance_account_code === 'private' ? 'private' : 'public';
                    const findAccountSql = 'SELECT id FROM finance_accounts WHERE code = ? LIMIT 1';

                    db.query(findAccountSql, [accountCode], (accErr, accResults) => {
                        if (accErr) {
                            console.error(accErr);
                            return db.rollback(() => {
                                res.status(500).json({ success: false, message: '查询财务账户失败' });
                            });
                        }

                        const accountId = accResults && accResults[0] ? accResults[0].id : null;

                        const insertFinancialRecordSql = `
                            INSERT INTO financial_records (
                                record_type,
                                category,
                                amount,
                                description,
                                reference_id,
                                reference_type,
                                transaction_date,
                                account_id,
                                created_by
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `;

                        const description = `采购批次 ${batch.batch_no} 支付，供应商：${batch.supplier_id}`;
                        const today = moment().format('YYYY-MM-DD');

                        db.query(
                            insertFinancialRecordSql,
                            [
                                'expense',
                                '采购支出',
                                paymentAmount,
                                description,
                                batchId,
                                'purchase_batch',
                                today,
                                accountId,
                                req.session.user.id
                            ],
                            (frErr) => {
                                if (frErr) {
                                    console.error(frErr);
                                    return db.rollback(() => {
                                        res.status(500).json({ success: false, message: '写入财务记录失败' });
                                    });
                                }

                                db.commit(err => {
                                    if (err) {
                                        return db.rollback(() => {
                                            res.status(500).json({ success: false, message: '事务提交失败' });
                                        });
                                    }

                                    const updatedPaidAmount = currentPaid + paymentAmount;

                                    res.json({ 
                                        success: true, 
                                        message: '支付成功',
                                        newPaidAmount: updatedPaidAmount,
                                        totalAmount: totalAmount,
                                        batchStatus: originalStatus
                                    });
                                });
                            }
                        );
                    });
                });
            });
        });
    });
});

// 采购统计页面
app.get('/purchases/stats', isAuthenticated, (req, res) => {
    const period = req.query.period || 'month';
    const supplierId = req.query.supplier || '';
    const startDate = req.query.startDate || moment().subtract(11, 'months').format('YYYY-MM-DD');
    const endDate = req.query.endDate || moment().format('YYYY-MM-DD');
    
    // 获取供应商列表
    db.query('SELECT * FROM suppliers ORDER BY name', (err, suppliers) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 查询采购批次数据
        const query = `
            SELECT 
                pb.*,
                s.name as supplier_name,
                (
                    SELECT COUNT(*) 
                    FROM purchase_accessory_items pai 
                    WHERE pai.batch_id = pb.id
                ) as accessory_types_count,
                (
                    SELECT IFNULL(SUM(pai.quantity), 0)
                    FROM purchase_accessory_items pai 
                    WHERE pai.batch_id = pb.id
                ) as total_quantity
            FROM purchase_batches pb
            LEFT JOIN suppliers s ON pb.supplier_id = s.id
            WHERE pb.purchase_date BETWEEN ? AND ?
            ORDER BY pb.purchase_date DESC
        `;
        
        db.query(query, [startDate, endDate], (err, batches) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            // 在Node层按供应商进行过滤（如果选择了供应商）
            let filteredBatches = batches;
            if (supplierId) {
                filteredBatches = batches.filter(batch => String(batch.supplier_id) === String(supplierId));
            }
            
            // 计算统计数据
            const stats = {
                totalBatches: filteredBatches.length,
                totalAmount: filteredBatches.reduce((sum, batch) => sum + parseFloat(batch.total_amount || 0), 0),
                pendingBatches: filteredBatches.filter(batch => batch.status === 'pending').length,
                approvedBatches: filteredBatches.filter(batch => batch.status === 'approved').length,
                deliveredBatches: filteredBatches.filter(batch => batch.status === 'delivered').length,
                completedBatches: filteredBatches.filter(batch => batch.status === 'completed').length,
                totalQuantity: filteredBatches.reduce((sum, batch) => sum + parseInt(batch.total_quantity || 0), 0),
                paidAmount: filteredBatches.reduce((sum, batch) => sum + parseFloat(batch.paid_amount || 0), 0)
            };
            
            // 按月/季度/年分组数据（图表用）
            let chartData = [];
            if (period === 'month') {
                // 按月份分组
                const monthlyData = {};
                filteredBatches.forEach(batch => {
                    const monthKey = moment(batch.purchase_date).format('YYYY-MM');
                    if (!monthlyData[monthKey]) {
                        monthlyData[monthKey] = {
                            month: moment(batch.purchase_date).format('YYYY年MM月'),
                            amount: 0,
                            batches: 0
                        };
                    }
                    monthlyData[monthKey].amount += parseFloat(batch.total_amount || 0);
                    monthlyData[monthKey].batches += 1;
                });
                
                // 转换为数组并按月份排序
                chartData = Object.values(monthlyData).sort((a, b) => 
                    a.month.localeCompare(b.month, 'zh-CN', { numeric: true })
                );
            } else if (period === 'quarter') {
                // 按季度分组
                const quarterlyData = {};
                filteredBatches.forEach(batch => {
                    const year = moment(batch.purchase_date).format('YYYY');
                    const quarter = '第' + Math.ceil(moment(batch.purchase_date).month() / 3 + 1) + '季度';
                    const quarterKey = `${year}-${quarter}`;
                    
                    if (!quarterlyData[quarterKey]) {
                        quarterlyData[quarterKey] = {
                            quarter: `${year}年${quarter}`,
                            amount: 0,
                            batches: 0
                        };
                    }
                    quarterlyData[quarterKey].amount += parseFloat(batch.total_amount || 0);
                    quarterlyData[quarterKey].batches += 1;
                });
                
                // 转换为数组并按季度排序
                chartData = Object.values(quarterlyData).sort((a, b) => 
                    a.quarter.localeCompare(b.quarter, 'zh-CN', { numeric: true })
                );
            } else {
                // 按年分组
                const yearlyData = {};
                filteredBatches.forEach(batch => {
                    const year = moment(batch.purchase_date).format('YYYY');
                    if (!yearlyData[year]) {
                        yearlyData[year] = {
                            year: year + '年',
                            amount: 0,
                            batches: 0
                        };
                    }
                    yearlyData[year].amount += parseFloat(batch.total_amount || 0);
                    yearlyData[year].batches += 1;
                });
                
                // 转换为数组并按年份排序
                chartData = Object.values(yearlyData).sort((a, b) => 
                    a.year.localeCompare(b.year, 'zh-CN', { numeric: true })
                );
            }
            
            // 按供应商统计
            const supplierStats = {};
            filteredBatches.forEach(batch => {
                const supplierName = batch.supplier_name || '未知供应商';
                if (!supplierStats[supplierName]) {
                    supplierStats[supplierName] = {
                        name: supplierName,
                        batches: 0,
                        amount: 0,
                        quantity: 0
                    };
                }
                supplierStats[supplierName].batches += 1;
                supplierStats[supplierName].amount += parseFloat(batch.total_amount || 0);
                supplierStats[supplierName].quantity += parseInt(batch.total_quantity || 0);
            });
            
            // 转换为数组并按金额降序排序
            const supplierChartData = Object.values(supplierStats).sort((a, b) => b.amount - a.amount);
            
            res.render('purchases/stats', {
                stats: stats,
                batches: filteredBatches,
                chartData: chartData,
                supplierChartData: supplierChartData,
                suppliers: suppliers,
                period: period,
                selectedSupplierId: supplierId,
                startDate: startDate,
                endDate: endDate,
                user: req.session.user,
                moment: moment,
                active: 'purchases',
                pageTitle: '采购统计'
            });
        });
    });
});

// 导出采购记录
app.get('/purchases/export', isAuthenticated, (req, res) => {
    // 这里可以添加导出Excel或CSV的功能
    res.status(501).send('导出功能正在开发中');
});

// 启动服务器
// ========================= 合作伙伴管理路由 =========================

// 合作伙伴管理主页
app.get('/partners', isAuthenticated, (req, res) => {
    db.query(`
        SELECT * FROM partners 
        ORDER BY status DESC, created_at DESC
    `, (err, partners) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        res.render('partners/index', {
            partners: partners,
            user: req.session.user,
            moment: moment,
            active: 'partners',
            pageTitle: '合作伙伴管理'
        });
    });
});

// 新增合作伙伴页面
app.get('/partners/add', isAuthenticated, (req, res) => {
    res.render('partners/add', {
        user: req.session.user,
        moment: moment,
        active: 'partners',
        pageTitle: '新增合作伙伴'
    });
});

// 处理新增合作伙伴
app.post('/partners/add', isAuthenticated, (req, res) => {
    const {
        name,
        contactPerson,
        phone,
        email,
        address,
        commissionRate,
        businessLicense,
        bankAccount
    } = req.body;
    
    // 验证必填字段
    if (!name || commissionRate === undefined) {
        return res.status(400).json({ success: false, message: '请填写必填字段' });
    }
    
    const query = `
        INSERT INTO partners (
            name, contact_person, phone, email, address, commission_rate, 
            business_license, bank_account, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `;
    
    const values = [
        name,
        contactPerson || null,
        phone || null,
        email || null,
        address || null,
        commissionRate,
        businessLicense || null,
        bankAccount || null
    ];
    
    db.query(query, values, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '新增合作伙伴失败' });
        }
        
        res.json({ success: true, message: '合作伙伴创建成功', partnerId: result.insertId });
    });
});

// 切换合作伙伴状态
app.post('/partners/toggle-status/:id', isAuthenticated, (req, res) => {
    const partnerId = req.params.id;
    const { status } = req.body;
    
    if (status !== 'active' && status !== 'inactive') {
        return res.status(400).json({ success: false, message: '无效的状态值' });
    }
    
    db.query(`
        UPDATE partners SET status = ?, updated_at = NOW() WHERE id = ?
    `, [status, partnerId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '更新状态失败' });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: '合作伙伴不存在' });
        }
        
        res.json({ success: true, message: '状态更新成功' });
    });
});

// 取消租赁订单（从待处理或进行中改为已取消）
app.get('/rental-orders/cancel/:id', isAuthenticated, (req, res) => {
    const orderId = req.params.id;

    db.query(
        "UPDATE rental_orders SET status = 'cancelled', updated_at = NOW() WHERE id = ? AND status IN ('pending', 'active')",
        [orderId],
        (err, result) => {
            if (err) {
                console.error('取消租赁订单失败:', err);
                req.session.errorMessage = '取消订单失败，请稍后重试';
                return res.redirect('/rental-orders');
            }

            if (result.affectedRows === 0) {
                req.session.errorMessage = '订单不存在或状态不允许取消';
                return res.redirect('/rental-orders');
            }

            // 订单取消成功后，将该订单下的设备状态从已租出恢复为在仓库
            const deviceIdsSql = 'SELECT DISTINCT device_id FROM rental_order_items WHERE order_id = ?';
            db.query(deviceIdsSql, [orderId], (itemsErr, itemRows) => {
                if (itemsErr) {
                    console.error('查询订单设备失败:', itemsErr);
                    req.session.errorMessage = '订单已取消，但更新设备状态失败，请手工检查设备状态';
                    return res.redirect('/rental-orders');
                }

                const deviceIds = (itemRows || []).map(row => row.device_id).filter(id => !!id);
                if (deviceIds.length === 0) {
                    req.session.successMessage = '订单已取消';
                    return res.redirect('/rental-orders');
                }

                db.query(
                    "UPDATE devices SET status = 'in_warehouse' WHERE id IN (?)",
                    [deviceIds],
                    (updateDevicesErr) => {
                        if (updateDevicesErr) {
                            console.error('更新设备为在仓库状态失败:', updateDevicesErr);
                            req.session.errorMessage = '订单已取消，但部分设备状态更新失败，请手工检查设备状态';
                            return res.redirect('/rental-orders');
                        }

                        req.session.successMessage = '订单已取消，相关设备已恢复为在仓库';
                        return res.redirect('/rental-orders');
                    }
                );
            });
        }
    );
});

// 将租赁订单从待处理改为进行中
app.post('/rental-orders/start/:id', isAuthenticated, (req, res) => {
    const orderId = req.params.id;

    db.query(
        "UPDATE rental_orders SET status = 'active', updated_at = NOW() WHERE id = ? AND status = 'pending'",
        [orderId],
        (err, result) => {
            if (err) {
                console.error('更新订单状态为进行中失败:', err);
                return res.status(500).json({ success: false, message: '更新订单状态失败' });
            }

            if (result.affectedRows === 0) {
                return res.status(400).json({ success: false, message: '订单不存在或状态不是待处理' });
            }

            return res.json({ success: true, message: '订单已设置为进行中' });
        }
    );
});

// 租赁订单归还
app.post('/rental-orders/return/:id', isAuthenticated, (req, res) => {
    const orderId = req.params.id;
    
    // 开始事务
    db.beginTransaction(err => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '事务启动失败' });
        }
        
        // 查询订单信息
        db.query('SELECT * FROM rental_orders WHERE id = ?', [orderId], (err, orderResult) => {
            if (err) {
                return db.rollback(() => {
                    res.status(500).json({ success: false, message: '查询订单失败' });
                });
            }
            
            if (orderResult.length === 0) {
                return db.rollback(() => {
                    res.status(404).json({ success: false, message: '租赁订单不存在' });
                });
            }
            
            const order = orderResult[0];
            
            if (order.status !== 'active') {
                return db.rollback(() => {
                    res.status(400).json({ success: false, message: '只有进行中的订单才能归还' });
                });
            }
            
            // 更新订单状态为已归还
            db.query('UPDATE rental_orders SET status = "returned" WHERE id = ?', [orderId], (err) => {
                if (err) {
                    return db.rollback(() => {
                        res.status(500).json({ success: false, message: '更新订单状态失败' });
                    });
                }
                
                // 查询订单中的设备
                db.query('SELECT device_id FROM rental_order_items WHERE order_id = ?', [orderId], (err, itemsResult) => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).json({ success: false, message: '查询设备项失败' });
                        });
                    }
                    
                    if (itemsResult.length === 0) {
                        return db.rollback(() => {
                            res.status(404).json({ success: false, message: '未找到租赁设备项' });
                        });
                    }
                    
                    let completedUpdates = 0;
                    const totalUpdates = itemsResult.length;
                    
                    // 更新所有设备状态为可用
                    itemsResult.forEach(item => {
                        db.query('UPDATE devices SET status = "available" WHERE id = ?', [item.device_id], (err) => {
                            if (err) {
                                console.error('更新设备状态失败:', err);
                            }
                            
                            completedUpdates++;
                            if (completedUpdates === totalUpdates) {
                                // 所有设备更新完成，提交事务
                                db.commit(err => {
                                    if (err) {
                                        return db.rollback(() => {
                                            res.status(500).json({ success: false, message: '事务提交失败' });
                                        });
                                    }
                                    
                                    res.json({ success: true, message: '设备归还成功' });
                                });
                            }
                        });
                    });
                });
            });
        });
    });
});

// ==================== 客户消费管理 API ====================

// 1. 获取客户消费列表
app.get('/api/customer-billing/list', (req, res) => {
    const { status, keyword } = req.query;
    
    let sql = `
        SELECT 
            ca.id,
            ca.customer_id,
            ca.customer_code,
            ca.customer_name,
            ca.prepaid_amount,
            ca.updated_at,
            COUNT(DISTINCT ro.id) as rental_count,
            COALESCE(SUM(
                (DATEDIFF(
                    COALESCE(roi.actual_return_date, CURDATE()),
                    roi.start_date
                ) + 1) * roi.daily_rate
            ), 0) as consumed_amount,
            (ca.prepaid_amount - COALESCE(SUM(
                (DATEDIFF(
                    COALESCE(roi.actual_return_date, CURDATE()),
                    roi.start_date
                ) + 1) * roi.daily_rate
            ), 0)) as balance,
            CASE 
                WHEN (ca.prepaid_amount - COALESCE(SUM(
                    (DATEDIFF(
                        COALESCE(roi.actual_return_date, CURDATE()),
                        roi.start_date
                    ) + 1) * roi.daily_rate
                ), 0)) < 0 THEN 'overdue'
                ELSE 'paid'
            END as status
        FROM customer_accounts ca
        LEFT JOIN rental_orders ro ON ca.customer_id = ro.customer_id 
            AND ro.status IN ('renting', 'active', 'completed')
        LEFT JOIN rental_order_items roi ON ro.id = roi.order_id
        WHERE 1=1
    `;
    
    const params = [];
    
    // 添加关键字筛选到WHERE子句
    if (keyword) {
        sql += ' AND (ca.customer_code LIKE ? OR ca.customer_name LIKE ?)';
        const searchTerm = `%${keyword}%`;
        params.push(searchTerm, searchTerm);
    }
    
    // 添加GROUP BY
    sql += ' GROUP BY ca.id, ca.customer_id, ca.customer_code, ca.customer_name, ca.prepaid_amount, ca.updated_at';
    
    // 状态筛选使用HAVING
    if (status && status !== 'all') {
        sql += ' HAVING status = ?';
        params.push(status);
    }
    
    sql += ' ORDER BY ca.updated_at DESC';
    
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('查询客户消费列表失败:', err);
            return res.status(500).json({ success: false, message: '查询失败' });
        }
        
        res.json({ success: true, data: results });
    });
});

// 2. 获取客户消费详情
app.get('/api/customer-billing/detail/:customerId', (req, res) => {
    const { customerId } = req.params;
    
    // 查询客户账户信息
    db.query('SELECT * FROM customer_accounts WHERE customer_id = ?', [customerId], (err, accountResult) => {
        if (err || accountResult.length === 0) {
            return res.status(404).json({ success: false, message: '客户账户不存在' });
        }
        
        const account = accountResult[0];
        
        // 查询缴费记录
        db.query(
            'SELECT * FROM payment_records WHERE customer_id = ? ORDER BY payment_date DESC LIMIT 10',
            [customerId],
            (err, payments) => {
                if (err) {
                    console.error('查询缴费记录失败:', err);
                    return res.status(500).json({ success: false, message: '查询失败' });
                }
                
                // 查询消费明细
                db.query(
                    'SELECT * FROM customer_transaction_details WHERE customer_id = ? ORDER BY transaction_date DESC LIMIT 20',
                    [customerId],
                    (err, transactions) => {
                        if (err) {
                            console.error('查询消费明细失败:', err);
                            return res.status(500).json({ success: false, message: '查询失败' });
                        }
                        
                        // 查询租赁订单及明细，计算实际消耗金额
                        db.query(
                            `SELECT 
                                ro.id as order_id,
                                ro.order_number,
                                ro.status,
                                roi.id as item_id,
                                roi.device_id,
                                roi.daily_rate,
                                roi.monthly_rate,
                                roi.start_date,
                                roi.end_date,
                                roi.actual_return_date,
                                d.device_code,
                                d.device_name,
                                DATEDIFF(
                                    COALESCE(roi.actual_return_date, CURDATE()),
                                    roi.start_date
                                ) + 1 as rental_days,
                                (DATEDIFF(
                                    COALESCE(roi.actual_return_date, CURDATE()),
                                    roi.start_date
                                ) + 1) * roi.daily_rate as consumed_amount
                            FROM rental_orders ro
                            JOIN rental_order_items roi ON ro.id = roi.order_id
                            LEFT JOIN devices d ON roi.device_id = d.id
                            WHERE ro.customer_id = ? 
                            AND ro.status IN ('renting', 'active', 'completed')
                            ORDER BY roi.start_date DESC`,
                            [customerId],
                            (err, rentals) => {
                                if (err) {
                                    console.error('查询租赁信息失败:', err);
                                    return res.status(500).json({ success: false, message: '查询失败' });
                                }
                                
                                // 计算总消耗金额
                                let totalConsumed = 0;
                                rentals.forEach(rental => {
                                    totalConsumed += parseFloat(rental.consumed_amount || 0);
                                });
                                
                                res.json({
                                    success: true,
                                    data: {
                                        account,
                                        payments,
                                        transactions,
                                        rentals,
                                        totalConsumed: totalConsumed.toFixed(2)
                                    }
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});

// 3. 客户缴费
app.post('/api/customer-billing/payment', (req, res) => {
    const { customerId, amount, paymentDate, paymentMethod, operator, notes } = req.body;
    
    if (!customerId || !amount || amount <= 0) {
        return res.status(400).json({ success: false, message: '参数错误' });
    }
    
    // 如果没有传递缴费日期，使用当前日期
    const actualPaymentDate = paymentDate || new Date().toISOString().split('T')[0];
    
    db.beginTransaction(err => {
        if (err) {
            return res.status(500).json({ success: false, message: '事务启动失败' });
        }
        
        // 查询客户账户
        db.query('SELECT * FROM customer_accounts WHERE customer_id = ?', [customerId], (err, accountResult) => {
            if (err || accountResult.length === 0) {
                return db.rollback(() => {
                    res.status(404).json({ success: false, message: '客户账户不存在' });
                });
            }
            
            const account = accountResult[0];
            
            // 计算当前实际消耗金额（从租赁订单计算），并更新账户消耗和待分配收款余额
            db.query(
                `SELECT 
                    SUM((DATEDIFF(
                        COALESCE(roi.actual_return_date, CURDATE()),
                        roi.start_date
                    ) + 1) * roi.daily_rate) as total_consumed
                FROM rental_orders ro
                JOIN rental_order_items roi ON ro.id = roi.order_id
                WHERE ro.customer_id = ? 
                AND ro.status IN ('renting', 'active', 'completed')`,
                [customerId],
                (err, consumedResult) => {
                    if (err) {
                        return db.rollback(() => {
                            console.error('计算消耗金额失败:', err);
                            res.status(500).json({ success: false, message: '计算消耗金额失败' });
                        });
                    }
                    
                    const totalConsumed = parseFloat(consumedResult[0].total_consumed || 0);
                    const balanceBefore = parseFloat(account.balance);
                    const prepaidAmount = parseFloat(account.prepaid_amount || 0);
                    const currentUnallocated = parseFloat(account.unallocated_amount || 0);
                    const newUnallocatedAmount = currentUnallocated + parseFloat(amount);
                    const newBalance = prepaidAmount - totalConsumed;
                    const newStatus = newBalance < 0 ? 'overdue' : 'paid';
                    
                    // 更新客户账户：仅更新消耗、余额、状态和待分配收款余额
                    db.query(
                        `UPDATE customer_accounts 
                        SET consumed_amount = ?,
                            balance = ?,
                            status = ?,
                            unallocated_amount = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE customer_id = ?`,
                        [totalConsumed, newBalance, newStatus, newUnallocatedAmount, customerId],
                        (err) => {
                            if (err) {
                                return db.rollback(() => {
                                    console.error('更新账户失败:', err);
                                    res.status(500).json({ success: false, message: '更新账户失败' });
                                });
                            }
                            
                            // 插入缴费记录，使用指定的缴费日期
                            db.query(
                                `INSERT INTO payment_records (customer_id, customer_code, customer_name, payment_amount, payment_date, payment_method, operator, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                [customerId, account.customer_code, account.customer_name, amount, actualPaymentDate, paymentMethod, operator, notes],
                                (err, paymentResult) => {
                                    if (err) {
                                        return db.rollback(() => {
                                            console.error('插入缴费记录失败:', err);
                                            res.status(500).json({ success: false, message: '插入缴费记录失败' });
                                        });
                                    }
                                    
                                    // 插入消费明细（此时账户余额未因本次缴费发生变化，仅记录收款流水）
                                    db.query(
                                        `INSERT INTO customer_transaction_details (customer_id, customer_code, transaction_type, amount, balance_before, balance_after, transaction_date, related_id, notes, operator)
                                        VALUES (?, ?, 'payment', ?, ?, ?, ?, ?, ?, ?)`,
                                        [customerId, account.customer_code, amount, balanceBefore, newBalance, actualPaymentDate, paymentResult.insertId, notes, operator],
                                        (err) => {
                                            if (err) {
                                                return db.rollback(() => {
                                                    console.error('插入消费明细失败:', err);
                                                    res.status(500).json({ success: false, message: '插入消费明细失败' });
                                                });
                                            }
                                            
                                            // 提交事务
                                            db.commit(err => {
                                                if (err) {
                                                    return db.rollback(() => {
                                                        res.status(500).json({ success: false, message: '事务提交失败' });
                                                    });
                                                }
                                                
                                                res.json({ 
                                                    success: true, 
                                                    message: '缴费成功',
                                                    data: {
                                                        balanceBefore,
                                                        balanceAfter: newBalance,
                                                        paymentAmount: parseFloat(amount),
                                                        prepaidAmount: prepaidAmount,
                                                        unallocatedAmount: newUnallocatedAmount,
                                                        consumedAmount: totalConsumed,
                                                        status: newStatus,
                                                        paymentDate: actualPaymentDate
                                                    }
                                                });
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

// 4. 更新所有客户的消耗金额和余额（从租赁订单实时计算）
app.post('/api/customer-billing/update-all-consumed', (req, res) => {
    // 查询所有有租赁记录的客户
    db.query(
        `SELECT DISTINCT ro.customer_id, c.name as customer_name
        FROM rental_orders ro
        JOIN customers c ON ro.customer_id = c.id
        WHERE ro.status IN ('renting', 'active', 'completed')`,
        (err, customers) => {
            if (err) {
                console.error('查询客户失败:', err);
                return res.status(500).json({ success: false, message: '查询客户失败' });
            }
            
            let completed = 0;
            let updated = 0;
            
            if (customers.length === 0) {
                return res.json({ success: true, message: '没有需要更新的客户', updated: 0 });
            }
            
            customers.forEach(customer => {
                // 计算该客户的总消耗金额
                db.query(
                    `SELECT 
                        SUM((DATEDIFF(
                            COALESCE(roi.actual_return_date, CURDATE()),
                            roi.start_date
                        ) + 1) * roi.daily_rate) as total_consumed
                    FROM rental_orders ro
                    JOIN rental_order_items roi ON ro.id = roi.order_id
                    WHERE ro.customer_id = ? 
                    AND ro.status IN ('renting', 'active', 'completed')`,
                    [customer.customer_id],
                    (err, consumedResult) => {
                        if (err) {
                            console.error(`计算客户${customer.customer_id}消耗金额失败:`, err);
                            completed++;
                            if (completed === customers.length) {
                                res.json({ success: true, message: `更新完成，成功更新${updated}个客户`, updated });
                            }
                            return;
                        }
                        
                        const totalConsumed = parseFloat(consumedResult[0].total_consumed || 0);
                        
                        // 查询或创建客户账户
                        db.query(
                            'SELECT * FROM customer_accounts WHERE customer_id = ?',
                            [customer.customer_id],
                            (err, accountResult) => {
                                if (err) {
                                    console.error(`查询客户${customer.customer_id}账户失败:`, err);
                                    completed++;
                                    if (completed === customers.length) {
                                        res.json({ success: true, message: `更新完成，成功更新${updated}个客户`, updated });
                                    }
                                    return;
                                }
                                
                                const prepaidAmount = accountResult.length > 0 ? parseFloat(accountResult[0].prepaid_amount) : 0;
                                const newBalance = prepaidAmount - totalConsumed;
                                const newStatus = newBalance < 0 ? 'overdue' : 'paid';
                                const customerCode = accountResult.length > 0 ? accountResult[0].customer_code : `KH${String(customer.customer_id).padStart(4, '0')}`;
                                
                                // 更新或插入客户账户
                                db.query(
                                    `INSERT INTO customer_accounts (customer_id, customer_code, customer_name, prepaid_amount, consumed_amount, balance, status)
                                    VALUES (?, ?, ?, ?, ?, ?, ?)
                                    ON DUPLICATE KEY UPDATE
                                        consumed_amount = VALUES(consumed_amount),
                                        balance = VALUES(balance),
                                        status = VALUES(status),
                                        updated_at = CURRENT_TIMESTAMP`,
                                    [customer.customer_id, customerCode, customer.customer_name, prepaidAmount, totalConsumed, newBalance, newStatus],
                                    (err) => {
                                        if (err) {
                                            console.error(`更新客户${customer.customer_id}账户失败:`, err);
                                        } else {
                                            updated++;
                                        }
                                        
                                        completed++;
                                        if (completed === customers.length) {
                                            res.json({ success: true, message: `更新完成，成功更新${updated}个客户`, updated });
                                        }
                                    }
                                );
                            }
                        );
                    }
                );
            });
        }
    );
});

// 5. 获取客户最新账单
app.get('/api/customer-billing/latest-bill/:customerId', (req, res) => {
    const { customerId } = req.params;
    
    db.query(
        `SELECT * FROM customer_bills 
        WHERE customer_id = ? 
        ORDER BY period_end DESC, bill_date DESC 
        LIMIT 1`,
        [customerId],
        (err, results) => {
            if (err) {
                console.error('查询最新账单失败:', err);
                return res.status(500).json({ success: false, message: '查询失败' });
            }
            
            if (results.length === 0) {
                return res.json({ success: false, message: '该客户暂无账单记录' });
            }
            
            res.json({ success: true, data: results[0] });
        }
    );
});

// 6. 获取相邻账单（上一期或下一期）
app.get('/api/customer-billing/adjacent-bill/:customerId', (req, res) => {
    const { customerId } = req.params;
    const { direction, currentBillId } = req.query;
    
    // 先获取当前账单的账期
    db.query(
        'SELECT period_end FROM customer_bills WHERE id = ?',
        [currentBillId],
        (err, currentBill) => {
            if (err || currentBill.length === 0) {
                return res.json({ success: false, message: '当前账单不存在' });
            }
            
            const currentPeriodEnd = currentBill[0].period_end;
            let sql, orderBy;
            
            if (direction === 'prev') {
                // 上一期：账期结束日期小于当前账单
                sql = `SELECT * FROM customer_bills 
                       WHERE customer_id = ? AND period_end < ?
                       ORDER BY period_end DESC 
                       LIMIT 1`;
            } else {
                // 下一期：账期结束日期大于当前账单
                sql = `SELECT * FROM customer_bills 
                       WHERE customer_id = ? AND period_end > ?
                       ORDER BY period_end ASC 
                       LIMIT 1`;
            }
            
            db.query(sql, [customerId, currentPeriodEnd], (err, results) => {
                if (err) {
                    console.error('查询相邻账单失败:', err);
                    return res.status(500).json({ success: false, message: '查询失败' });
                }
                
                if (results.length === 0) {
                    return res.json({ success: false, message: '没有更多账单' });
                }
                
                res.json({ success: true, data: results[0] });
            });
        }
    );
});

// 7. 按日期搜索账单
app.get('/api/customer-billing/search-bill/:customerId', (req, res) => {
    const { customerId } = req.params;
    const { date } = req.query;
    
    if (!date) {
        return res.status(400).json({ success: false, message: '请提供日期' });
    }
    
    // 查找该日期所在账期的账单
    db.query(
        `SELECT * FROM customer_bills 
        WHERE customer_id = ? 
        AND ? BETWEEN period_start AND period_end
        LIMIT 1`,
        [customerId, date],
        (err, results) => {
            if (err) {
                console.error('搜索账单失败:', err);
                return res.status(500).json({ success: false, message: '查询失败' });
            }
            
            if (results.length === 0) {
                return res.json({ success: false, message: '未找到该日期所在账期的账单' });
            }
            
            res.json({ success: true, data: results[0] });
        }
    );
});

// 7. 调整账期（修改本期止日期）
app.post('/api/customer-billing/adjust-period-end', (req, res) => {
    const { billId, customerId, newPeriodEnd } = req.body;
    
    if (!billId || !customerId || !newPeriodEnd) {
        return res.status(400).json({ success: false, message: '参数错误' });
    }
    
    db.beginTransaction(err => {
        if (err) {
            return res.status(500).json({ success: false, message: '事务启动失败' });
        }
        
        // 查询账单信息
        db.query('SELECT * FROM customer_bills WHERE id = ? AND customer_id = ?', [billId, customerId], (err, bills) => {
            if (err || bills.length === 0) {
                return db.rollback(() => {
                    res.status(404).json({ success: false, message: '账单不存在' });
                });
            }
            
            const bill = bills[0];
            const oldPeriodEnd = bill.period_end;
            
            // 更新账单的本期止日期
            db.query(
                'UPDATE customer_bills SET period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newPeriodEnd, billId],
                (err) => {
                    if (err) {
                        return db.rollback(() => {
                            console.error('更新账单失败:', err);
                            res.status(500).json({ success: false, message: '更新账单失败' });
                        });
                    }
                    
                    // 查询是否有下一期账单（下期账单的本期起 = 当前账单的原本期止）
                    db.query(
                        'SELECT * FROM customer_bills WHERE customer_id = ? AND period_start = ? ORDER BY period_start ASC LIMIT 1',
                        [customerId, oldPeriodEnd],
                        (err, nextBills) => {
                            if (err) {
                                return db.rollback(() => {
                                    console.error('查询下期账单失败:', err);
                                    res.status(500).json({ success: false, message: '查询下期账单失败' });
                                });
                            }
                            
                            // 如果有下期账单，更新下期账单的本期起日期
                            if (nextBills.length > 0) {
                                db.query(
                                    'UPDATE customer_bills SET period_start = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                                    [newPeriodEnd, nextBills[0].id],
                                    (err) => {
                                        if (err) {
                                            return db.rollback(() => {
                                                console.error('更新下期账单失败:', err);
                                                res.status(500).json({ success: false, message: '更新下期账单失败' });
                                            });
                                        }
                                        
                                        // 提交事务
                                        db.commit(err => {
                                            if (err) {
                                                return db.rollback(() => {
                                                    res.status(500).json({ success: false, message: '事务提交失败' });
                                                });
                                            }
                                            
                                            res.json({ 
                                                success: true, 
                                                message: '账期调整成功，已同步更新下期账单',
                                                data: {
                                                    oldPeriodEnd,
                                                    newPeriodEnd,
                                                    nextBillUpdated: true
                                                }
                                            });
                                        });
                                    }
                                );
                            } else {
                                // 没有下期账单，直接提交
                                db.commit(err => {
                                    if (err) {
                                        return db.rollback(() => {
                                            res.status(500).json({ success: false, message: '事务提交失败' });
                                        });
                                    }
                                    
                                    res.json({ 
                                        success: true, 
                                        message: '账期调整成功',
                                        data: {
                                            oldPeriodEnd,
                                            newPeriodEnd,
                                            nextBillUpdated: false
                                        }
                                    });
                                });
                            }
                        }
                    );
                }
            );
        });
    });
});

// 8. 测试数据：添加测试客户账户
app.post('/api/customer-billing/test-data', (req, res) => {
    const testData = [
        { code: 'KH0001', name: '小李', prepaid: 0, consumed: 3707.93 },
        { code: 'KH0002', name: '恒炬科技', prepaid: 0, consumed: 3433.92 },
        { code: 'KH0003', name: '远洋集团', prepaid: 0, consumed: 0 }
    ];
    
    let completed = 0;
    testData.forEach((data, index) => {
        // 先插入或更新 partners 表
        db.query(
            `INSERT INTO partners (name, status) VALUES (?, 'active') 
            ON DUPLICATE KEY UPDATE name = VALUES(name)`,
            [data.name],
            (err, partnerResult) => {
                if (err) {
                    console.error('插入客户失败:', err);
                    completed++;
                    return;
                }
                
                const partnerId = partnerResult.insertId || (index + 1);
                const balance = data.prepaid - data.consumed;
                const status = balance < 0 ? 'overdue' : (balance === 0 && data.consumed > 0 ? 'paid' : 'paid');
                
                // 插入或更新客户账户
                db.query(
                    `INSERT INTO customer_accounts (customer_id, customer_code, customer_name, prepaid_amount, consumed_amount, balance, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        prepaid_amount = VALUES(prepaid_amount),
                        consumed_amount = VALUES(consumed_amount),
                        balance = VALUES(balance),
                        status = VALUES(status)`,
                    [partnerId, data.code, data.name, data.prepaid, data.consumed, balance, status],
                    (err) => {
                        if (err) {
                            console.error('插入客户账户失败:', err);
                        }
                        
                        completed++;
                        if (completed === testData.length) {
                            res.json({ success: true, message: '测试数据添加成功' });
                        }
                    }
                );
            }
        );
    });
});

// 5. 手动触发每日扣费任务（测试用）
app.post('/api/customer-billing/trigger-daily-charge', (req, res) => {
    const dailyChargeTask = require('./daily-charge-task');
    
    try {
        dailyChargeTask.executeDailyCharge();
        res.json({ success: true, message: '扣费任务已触发' });
    } catch (error) {
        console.error('触发扣费任务失败:', error);
        res.status(500).json({ success: false, message: '触发失败' });
    }
});

// 6. 为单个客户生成账单
app.post('/api/customer-billing/generate-bills/:customerId', (req, res) => {
    const { customerId } = req.params;

    // 日期标准化函数：将日期设置为当天的00:00:00
    function normalizeToStartOfDay(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    // 辅助函数
    function addMonths(date, months) {
        const d = new Date(date.getTime());
        const day = d.getDate();
        d.setMonth(d.getMonth() + months);
        if (d.getDate() < day) {
            d.setDate(0);
        }
        return d;
    }

    function formatDate(d) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getCycleMonths(paymentCycle) {
        if (paymentCycle === 'monthly') return 1;
        if (paymentCycle === 'quarterly') return 3;
        if (paymentCycle === 'yearly') return 12;
        return 3;
    }

    console.log(`\n==== 生成客户 ${customerId} 的账单 ====`);

    // 查询该客户的租赁订单（包含在租、已退租、已完成等状态）
    db.query(
        "SELECT id, order_number, payment_cycle, start_date, end_date, status FROM rental_orders WHERE customer_id = ? AND status IN ('renting','active','returned','expired','completed')",
        [customerId],
        (err, orders) => {
            if (err) {
                console.error('查询订单失败:', err);
                return res.status(500).json({ success: false, message: '查询订单失败' });
            }

            if (!orders || orders.length === 0) {
                return res.json({ success: true, message: '该客户无有效租赁订单，无需生成账单', billsCreated: 0 });
            }

            const today = new Date();
            const groups = {};

            // 按付款周期分组
            orders.forEach(order => {
                const cycle = order.payment_cycle || 'quarterly';
                if (!groups[cycle]) groups[cycle] = [];
                groups[cycle].push(order);
            });

            let totalBillsCreated = 0;
            let groupsProcessed = 0;
            const totalGroups = Object.keys(groups).length;

            // 处理每个周期组
            Object.keys(groups).forEach(cycle => {
                const cycleOrders = groups[cycle];
                const cycleMonths = getCycleMonths(cycle);

                // 找最早的订单开始日期
                let minStart = new Date(cycleOrders[0].start_date);
                cycleOrders.forEach(o => {
                    const oStart = new Date(o.start_date);
                    if (oStart < minStart) minStart = oStart;
                });

                // 找最晚的计费截止日期
                // 默认使用订单的合同结束日 end_date；
                // 对仍在租的订单（status 为 renting/active），如果今天晚于合同结束日，
                // 则至少把截止日期延长到今天，保证合同结束后仍能生成后续账单。
                const todayForMax = new Date();
                let maxEnd = null;
                cycleOrders.forEach(o => {
                    let candidateEnd = o.end_date ? new Date(o.end_date) : null;

                    if (o.status === 'renting' || o.status === 'active') {
                        if (!candidateEnd || todayForMax > candidateEnd) {
                            candidateEnd = todayForMax;
                        }
                    }

                    if (!candidateEnd || Number.isNaN(candidateEnd.getTime())) {
                        return;
                    }

                    if (!maxEnd || candidateEnd > maxEnd) {
                        maxEnd = candidateEnd;
                    }
                });

                if (!maxEnd) {
                    maxEnd = todayForMax;
                }

                // 生成账期列表（按付款周期生成，不受订单结束日期限制）
                const periods = [];
                let periodStart = new Date(minStart);
                while (periodStart <= maxEnd) {
                    const periodEnd = new Date(addMonths(periodStart, cycleMonths));
                    periodEnd.setDate(periodEnd.getDate() - 1);
                    // 移除了强制将periodEnd限制为maxEnd的逻辑，让最后一期账单也按完整周期计算
                    if (periodEnd >= minStart) {
                        periods.push({
                            start: formatDate(periodStart),
                            end: formatDate(periodEnd),
                            cycle: cycle
                        });
                    }
                    periodStart = new Date(addMonths(periodStart, cycleMonths));
                }

                let periodsProcessed = 0;

                // 为每个账期创建账单（仅跳过未来账期，本期起在刷新日之后不生成）
                periods.forEach(period => {
                    const periodStartDate = new Date(period.start);
                    const diffDaysFromRefresh = Math.floor((today.getTime() - periodStartDate.getTime()) / (24 * 3600 * 1000));
                    // 仅当本期起在刷新日之后（diffDaysFromRefresh 为负数）时跳过
                    if (diffDaysFromRefresh < 0) {
                        console.log(`  跳过账期 ${period.start} ~ ${period.end}：本期起在刷新日之后（未来账期，diff=${diffDaysFromRefresh}）`);
                        periodsProcessed++;
                        checkComplete();
                        return;
                    }


                    const checkSql = `SELECT id, discount_amount FROM customer_bills WHERE customer_id = ? AND period_start = ? AND period_end = ?`;
                    db.query(checkSql, [customerId, period.start, period.end], (err, existingBills) => {
                        if (err) {
                            console.error('检查账单失败:', err);
                            periodsProcessed++;
                            checkComplete();
                            return;
                        }

                        const existingBillId = existingBills.length > 0 ? existingBills[0].id : null;
                        const existingDiscount = existingBills.length > 0 && existingBills[0].discount_amount != null
                            ? parseFloat(existingBills[0].discount_amount)
                            : 0;

                        if (existingBillId) {
                            console.log(`  账单已存在，将按最新订单重新计算金额: ${period.start} ~ ${period.end}`);
                        }


                        // 查询该客户所有订单的明细项，用于精确计算金额

                        const orderIds = cycleOrders.map(o => o.id);
                        const itemsSql = `
                            SELECT 
                                roi.id AS order_item_id,
                                roi.order_id,
                                roi.daily_rate,
                                roi.monthly_rate,
                                roi.start_date,
                                roi.end_date,
                                roi.actual_return_date,
                                ro.status AS order_status
                            FROM rental_order_items roi
                            JOIN rental_orders ro ON roi.order_id = ro.id
                            WHERE roi.order_id IN (${orderIds.map(() => '?').join(',')})
                        `;

                        db.query(itemsSql, orderIds, (err, items) => {
                            if (err) {
                                console.error('查询订单明细失败:', err);
                                periodsProcessed++;
                                checkComplete();
                                return;
                            }

                            // 查询租金调整历史（针对这些订单）
                            const adjustmentsSql = `
                                SELECT 
                                    order_item_id,
                                    old_monthly_rate,
                                    new_monthly_rate,
                                    adjust_effective_date
                                FROM rental_rent_adjustments
                                WHERE order_id IN (${orderIds.map(() => '?').join(',')})
                                ORDER BY order_item_id, adjust_effective_date
                            `;

                            db.query(adjustmentsSql, orderIds, (err, adjustments) => {
                                if (err) {
                                    console.error('查询租金调整历史失败:', err);
                                    periodsProcessed++;
                                    checkComplete();
                                    return;
                                }

                                // 将调整历史按 order_item_id 分组
                                const adjustmentsByItem = {};
                                adjustments.forEach(adj => {
                                    if (!adjustmentsByItem[adj.order_item_id]) {
                                        adjustmentsByItem[adj.order_item_id] = [];
                                    }
                                    adjustmentsByItem[adj.order_item_id].push(adj);
                                });

                                // 计算该账期的应收金额（从订单明细项精确计算，考虑租金调整）
                                let totalAmount = 0;
                                let itemCount = 0;

                                items.forEach(item => {
                                    if (!item.start_date) return;

                                    const itemStart = new Date(item.start_date);
                                    const pStart = new Date(period.start);
                                    const pEnd = new Date(period.end);

                                    let itemEnd;
                                    if (item.actual_return_date) {
                                        itemEnd = new Date(item.actual_return_date);
                                    } else if (item.order_status === 'renting' || item.order_status === 'active') {
                                        itemEnd = new Date(pEnd);
                                    } else if (item.end_date) {
                                        itemEnd = new Date(item.end_date);
                                    } else {
                                        itemEnd = new Date(pEnd);
                                    }

                                    // 计算重叠时间段
                                    const overlapStart = itemStart > pStart ? itemStart : pStart;
                                    const overlapEnd = itemEnd < pEnd ? itemEnd : pEnd;

                                    if (overlapStart > overlapEnd) return;

                                    // 获取该明细的租金调整历史
                                    const itemAdjustments = adjustmentsByItem[item.order_item_id] || [];

                                    // 根据调整历史分段计算费用
                                    let itemAmount = 0;
                                    let currentStart = new Date(overlapStart);

                                    if (itemAdjustments.length === 0) {
                                        // 没有调整历史，直接用当前价格
                                        const days = Math.floor((overlapEnd.getTime() - currentStart.getTime()) / (24 * 3600 * 1000)) + 1;
                                        const dailyRate = item.daily_rate ? parseFloat(item.daily_rate) : (item.monthly_rate ? parseFloat(item.monthly_rate) / 30 : 0);
                                        itemAmount = dailyRate * days;
                                    } else {
                                        // 有调整历史，需要分段计算
                                        itemAdjustments.forEach((adj) => {
                                            const adjustDate = normalizeToStartOfDay(new Date(adj.adjust_effective_date));
                                            
                                            // 计算调整前的天数和费用（不包含调整当天）
                                            if (currentStart < adjustDate && currentStart <= overlapEnd) {
                                                const segmentEnd = adjustDate < overlapEnd ? new Date(adjustDate.getTime() - 24 * 3600 * 1000) : overlapEnd;
                                                if (segmentEnd >= currentStart) {
                                                    const days = Math.floor((segmentEnd.getTime() - currentStart.getTime()) / (24 * 3600 * 1000)) + 1;
                                                    const dailyRate = parseFloat(adj.old_monthly_rate) / 30;
                                                    itemAmount += dailyRate * days;
                                                }
                                                currentStart = adjustDate;
                                            }
                                        });

                                        // 计算调整后剩余时间的费用（从调整当天开始）
                                        if (currentStart <= overlapEnd) {
                                            const days = Math.floor((overlapEnd.getTime() - currentStart.getTime()) / (24 * 3600 * 1000)) + 1;
                                            const lastAdjustment = itemAdjustments[itemAdjustments.length - 1];
                                            const dailyRate = parseFloat(lastAdjustment.new_monthly_rate) / 30;
                                            itemAmount += dailyRate * days;
                                        }
                                    }

                                    totalAmount += itemAmount;
                                    itemCount++;
                                });

                                if (totalAmount <= 0) {
                                    console.log(`  账期 ${period.start} ~ ${period.end} 金额为0，跳过`);
                                    periodsProcessed++;
                                    checkComplete();
                                    return;
                                }

                                // 生成账单编号（格式：BD[递增序号]+年月日-月日，例如 BD1 20250105-0206）
                                const billDate = formatDate(new Date());
                                const startDateStr = period.start.replace(/-/g, ''); // 取完整YYYYMMDD
                                const endDateStr = period.end.replace(/-/g, '').substring(4); // 取MMDD

                                if (!existingBillId) {
                                    const seqSql = 'SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM customer_bills';

                                    db.query(seqSql, (seqErr, seqRows) => {
                                        let seq = 1;
                                        if (!seqErr && seqRows && seqRows.length > 0 && seqRows[0].nextId) {
                                            seq = seqRows[0].nextId;
                                        } else if (seqErr) {
                                            console.error('获取账单序号失败，将使用1作为起始序号:', seqErr);
                                        }

                                        const billNumber = `BD${seq}${startDateStr}-${endDateStr}`;

                                        // 插入新账单
                                        const insertSql = `
                                            INSERT INTO customer_bills (bill_number, customer_id, period_start, period_end, payment_cycle, bill_date, amount, status, item_count)
                                            VALUES (?, ?, ?, ?, ?, ?, ?, 'unpaid', ?)
                                        `;
                                        db.query(insertSql, [billNumber, customerId, period.start, period.end, cycle, billDate, totalAmount.toFixed(2), itemCount], (err) => {
                                            if (err) {
                                                console.error('插入账单失败:', err);
                                            } else {
                                                console.log(`  ✓ 创建账单: ${billNumber}, ${period.start} ~ ${period.end}, 金额: ${totalAmount.toFixed(2)}, 项目数: ${itemCount}`);
                                                totalBillsCreated++;
                                            }
                                            periodsProcessed++;
                                            checkComplete();
                                        });
                                    });
                                } else {

                                    // 已存在账单：按最新订单重算金额，并结合历史收款重新判定状态
                                    const sumSql = `
                                        SELECT COALESCE(SUM(received_amount), 0) AS total_received
                                        FROM rent_received_records
                                        WHERE bill_id = ?
                                    `;

                                    db.query(sumSql, [existingBillId], (sumErr, sumRows) => {
                                        if (sumErr) {
                                            console.error('查询历史实收金额失败:', sumErr);
                                            periodsProcessed++;
                                            checkComplete();
                                            return;
                                        }

                                        const totalReceived = parseFloat((sumRows[0] && sumRows[0].total_received) || 0);
                                        const billAmount = totalAmount;
                                        const discountAmount = existingDiscount || 0;
                                        const settledAmount = totalReceived + discountAmount;
                                        const newStatus = settledAmount >= billAmount - 0.01 ? 'paid' : 'unpaid';

                                        const updateSql = `
                                            UPDATE customer_bills
                                            SET amount = ?, status = ?, item_count = ?, updated_at = CURRENT_TIMESTAMP
                                            WHERE id = ?
                                        `;

                                        db.query(updateSql, [billAmount.toFixed(2), newStatus, itemCount, existingBillId], (updateErr) => {
                                            if (updateErr) {
                                                console.error('更新账单失败:', updateErr);
                                            } else {
                                                console.log(`  ✓ 更新账单(ID=${existingBillId}): ${period.start} ~ ${period.end}, 新金额: ${billAmount.toFixed(2)}, 已收: ${totalReceived.toFixed(2)}, 状态: ${newStatus}`);
                                            }
                                            periodsProcessed++;
                                            checkComplete();
                                        });
                                    });
                                }

                            });
                        });
                    });
                });

                function checkComplete() {
                    if (periodsProcessed === periods.length) {
                        groupsProcessed++;
                        if (groupsProcessed === totalGroups) {
                            console.log(`\n==== 客户 ${customerId} 账单生成完成，共生成 ${totalBillsCreated} 张账单 ====\n`);
                            res.json({
                                success: true,
                                message: `账单生成完成，共生成 ${totalBillsCreated} 张账单`,
                                billsCreated: totalBillsCreated
                            });
                        }
                    }
                }
            });
        }
    );
});

// 7. 批量为所有客户生成账单
app.post('/api/customer-billing/generate-all-bills', (req, res) => {
    console.log('\n==== 开始批量生成所有客户账单 ====');

    // 日期标准化函数：将日期设置为当天的00:00:00
    function normalizeToStartOfDay(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    // 辅助函数
    function addMonths(date, months) {
        const d = new Date(date.getTime());
        const day = d.getDate();
        d.setMonth(d.getMonth() + months);
        if (d.getDate() < day) {
            d.setDate(0);
        }
        return d;
    }

    function formatDate(d) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getCycleMonths(paymentCycle) {
        if (paymentCycle === 'monthly') return 1;
        if (paymentCycle === 'quarterly') return 3;
        if (paymentCycle === 'yearly') return 12;
        return 3;
    }

    // 查询所有有租赁订单的客户（包含在租、已退租、已到期、已完成）
    db.query(
        "SELECT DISTINCT customer_id FROM rental_orders WHERE status IN ('renting','active','returned','expired','completed')",
        (err, customers) => {
            if (err) {
                console.error('查询客户列表失败:', err);
                return res.status(500).json({ success: false, message: '查询客户列表失败' });
            }

            if (!customers || customers.length === 0) {
                return res.json({ success: true, message: '没有需要生成账单的客户', totalBillsCreated: 0 });
            }

            console.log(`共找到 ${customers.length} 个有租赁记录的客户`);

            let totalBillsCreated = 0;
            let customersProcessed = 0;
            const totalCustomers = customers.length;
            const customerResults = [];

            // 为每个客户生成账单
            customers.forEach(customer => {
                const customerId = customer.customer_id;
                
                db.query(
                    "SELECT id, order_number, payment_cycle, start_date, end_date, status FROM rental_orders WHERE customer_id = ? AND status IN ('renting','active','returned','expired','completed')",
                    [customerId],
                    (err, orders) => {
                        if (err) {
                            console.error(`查询客户 ${customerId} 订单失败:`, err);
                            customersProcessed++;
                            customerResults.push({ customerId, billsCreated: 0, error: '查询订单失败' });
                            checkAllComplete();
                            return;
                        }

                        if (!orders || orders.length === 0) {
                            customersProcessed++;
                            customerResults.push({ customerId, billsCreated: 0 });
                            checkAllComplete();
                            return;
                        }

                        const today = new Date();
                        const groups = {};

                        // 按付款周期分组
                        orders.forEach(order => {
                            const cycle = order.payment_cycle || 'quarterly';
                            if (!groups[cycle]) groups[cycle] = [];
                            groups[cycle].push(order);
                        });

                        let customerBillsCreated = 0;
                        let groupsProcessed = 0;
                        const totalGroups = Object.keys(groups).length;

                        // 处理每个周期组
                        Object.keys(groups).forEach(cycle => {
                            const cycleOrders = groups[cycle];
                            const cycleMonths = getCycleMonths(cycle);

                            // 找最早的订单开始日期
                            let minStart = new Date(cycleOrders[0].start_date);
                            cycleOrders.forEach(o => {
                                const oStart = new Date(o.start_date);
                                if (oStart < minStart) minStart = oStart;
                            });

                            // 找最晚的计费截止日期
                            // 默认使用订单的合同结束日 end_date；
                            // 对仍在租的订单（status 为 renting/active），如果今天晚于合同结束日，
                            // 则至少把截止日期延长到今天，保证合同结束后仍能生成后续账单。
                            const todayForMax = new Date();
                            let maxEnd = null;
                            cycleOrders.forEach(o => {
                                let candidateEnd = o.end_date ? new Date(o.end_date) : null;

                                if (o.status === 'renting' || o.status === 'active') {
                                    if (!candidateEnd || todayForMax > candidateEnd) {
                                        candidateEnd = todayForMax;
                                    }
                                }

                                if (!candidateEnd || Number.isNaN(candidateEnd.getTime())) {
                                    return;
                                }

                                if (!maxEnd || candidateEnd > maxEnd) {
                                    maxEnd = candidateEnd;
                                }
                            });

                            if (!maxEnd) {
                                maxEnd = todayForMax;
                            }

                            // 生成账期列表（按付款周期生成，不受订单结束日期限制）
                            const periods = [];
                            let periodStart = new Date(minStart);
                            while (periodStart <= maxEnd) {
                                const periodEnd = new Date(addMonths(periodStart, cycleMonths));
                                periodEnd.setDate(periodEnd.getDate() - 1);
                                // 移除了强制将periodEnd限制为maxEnd的逻辑，让最后一期账单也按完整周期计算
                                if (periodEnd >= minStart) {
                                    periods.push({
                                        start: formatDate(periodStart),
                                        end: formatDate(periodEnd),
                                        cycle: cycle
                                    });
                                }
                                periodStart = new Date(addMonths(periodStart, cycleMonths));
                            }

                            let periodsProcessed = 0;

                            if (periods.length === 0) {
                                groupsProcessed++;
                                checkCustomerComplete();
                                return;
                            }

                            // 为每个账期创建或重算账单（已有账单会重算金额和状态）
                            periods.forEach(period => {
                                // 账单生成条件：仅跳过未来账期，本期起在刷新日之后不生成
                                const periodStartDate = new Date(period.start);
                                const diffDaysFromRefresh = Math.floor((today.getTime() - periodStartDate.getTime()) / (24 * 3600 * 1000));
                                // 仅当本期起在刷新日之后（diffDaysFromRefresh 为负数）时跳过
                                if (diffDaysFromRefresh < 0) {
                                    console.log(`    跳过账期 ${period.start} ~ ${period.end}：本期起在刷新日之后（未来账期，diff=${diffDaysFromRefresh}）`);
                                    periodsProcessed++;
                                    checkPeriodComplete();
                                    return;
                                }


                                const checkSql = `SELECT id, discount_amount FROM customer_bills WHERE customer_id = ? AND period_start = ? AND period_end = ?`;
                                db.query(checkSql, [customerId, period.start, period.end], (err, existingBills) => {
                                    if (err) {
                                        console.error(`检查客户 ${customerId} 账单失败:`, err);
                                        periodsProcessed++;
                                        checkPeriodComplete();
                                        return;
                                    }

                                    const existingBillId = existingBills.length > 0 ? existingBills[0].id : null;
                                    const existingDiscount = existingBills.length > 0 && existingBills[0].discount_amount != null
                                        ? parseFloat(existingBills[0].discount_amount)
                                        : 0;

                                    // 查询该客户所有订单的明细项，用于精确计算金额
                                    const orderIds = cycleOrders.map(o => o.id);
                                    const itemsSql = `
                                        SELECT 
                                            roi.order_id,
                                            roi.daily_rate,
                                            roi.monthly_rate,
                                            roi.start_date,
                                            roi.end_date,
                                            roi.actual_return_date,
                                            ro.status AS order_status
                                        FROM rental_order_items roi
                                        JOIN rental_orders ro ON roi.order_id = ro.id
                                        WHERE roi.order_id IN (${orderIds.map(() => '?').join(',')})
                                    `;


                                    db.query(itemsSql, orderIds, (err, items) => {
                                        if (err) {
                                            console.error(`查询客户 ${customerId} 订单明细失败:`, err);
                                            periodsProcessed++;
                                            checkPeriodComplete();
                                            return;
                                        }

                                        // 计算该账期的应收金额（从订单明细项精确计算）
                                        let totalAmount = 0;
                                        let itemCount = 0;

                                        const pStart = new Date(period.start);
                                        const pEnd = new Date(period.end);

                                        // 辅助函数：判断两个日期之间是否构成完整月数
                                        function getMonthsBetween(start, end) {
                                            const days = Math.floor((end.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1;
                                            
                                            // 允许±1天的误差
                                            if (Math.abs(days - 30) <= 1) return 1;   // 约1个月
                                            if (Math.abs(days - 91) <= 2) return 3;   // 约3个月
                                            if (Math.abs(days - 365) <= 2) return 12; // 约12个月
                                            
                                            return 0; // 不是完整月数
                                        }

                                        items.forEach(item => {
                                            if (!item.start_date) return;

                                            const itemStart = new Date(item.start_date);

                                            let itemEnd;
                                            if (item.actual_return_date) {
                                                itemEnd = new Date(item.actual_return_date);
                                            } else if (item.order_status === 'renting' || item.order_status === 'active') {
                                                itemEnd = new Date(pEnd);
                                            } else if (item.end_date) {
                                                itemEnd = new Date(item.end_date);
                                            } else {
                                                itemEnd = new Date(pEnd);
                                            }

                                            // 计算重叠时间段
                                            const overlapStart = itemStart > pStart ? itemStart : pStart;
                                            const overlapEnd = itemEnd < pEnd ? itemEnd : pEnd;

                                            if (overlapStart > overlapEnd) return;

                                            const days = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (24 * 3600 * 1000)) + 1;
                                            const months = getMonthsBetween(overlapStart, overlapEnd);
                                            
                                            let amount = 0;
                                            const monthlyRate = item.monthly_rate ? parseFloat(item.monthly_rate) : 0;
                                            const dailyRate = item.daily_rate ? parseFloat(item.daily_rate) : (monthlyRate / 30);

                                            // 如果重叠部分构成完整月数，按月租金计算
                                            if (months > 0 && monthlyRate > 0) {
                                                amount = monthlyRate * months;
                                                console.log(`    明细项按月租金计算: ${monthlyRate} × ${months}月 = ${amount.toFixed(2)} (${days}天)`);
                                            } else {
                                                // 否则按日租金计算
                                                amount = dailyRate * days;
                                                console.log(`    明细项按日租金计算: ${dailyRate.toFixed(2)} × ${days}天 = ${amount.toFixed(2)}`);
                                            }

                                            totalAmount += amount;
                                            itemCount++;
                                        });

                                        if (totalAmount <= 0) {
                                            periodsProcessed++;
                                            checkPeriodComplete();
                                            return;
                                        }

                                        // 生成账单编号（格式：BD[递增序号]+年月日-月日）
                                        const billDate = formatDate(new Date());
                                        const startDateStr = period.start.replace(/-/g, ''); // 取完整YYYYMMDD
                                        const endDateStr = period.end.replace(/-/g, '').substring(4); // 取MMDD

                                        if (!existingBillId) {
                                            const seqSql = 'SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM customer_bills';

                                            db.query(seqSql, (seqErr, seqRows) => {
                                                let seq = 1;
                                                if (!seqErr && seqRows && seqRows.length > 0 && seqRows[0].nextId) {
                                                    seq = seqRows[0].nextId;
                                                } else if (seqErr) {
                                                    console.error('获取账单序号失败，将使用1作为起始序号:', seqErr);
                                                }

                                                const billNumber = `BD${seq}${startDateStr}-${endDateStr}`;

                                                // 插入账单
                                                const insertSql = `
                                                    INSERT INTO customer_bills (bill_number, customer_id, period_start, period_end, payment_cycle, bill_date, amount, status, item_count)
                                                    VALUES (?, ?, ?, ?, ?, ?, ?, 'unpaid', ?)
                                                `;
                                                db.query(insertSql, [billNumber, customerId, period.start, period.end, cycle, billDate, totalAmount.toFixed(2), itemCount], (err) => {

                                                    if (err) {
                                                        console.error(`插入账单失败:`, err);
                                                    } else {
                                                        console.log(`  ✓ 客户 ${customerId} 创建账单: ${billNumber}, ${period.start} ~ ${period.end}, 金额: ${totalAmount.toFixed(2)}, 项目数: ${itemCount}`);
                                                        customerBillsCreated++;
                                                    }
                                                    periodsProcessed++;
                                                    checkPeriodComplete();
                                                });
                                            });
                                        } else {
                                            // 已存在账单：按最新订单重算金额，并结合历史收款和折扣重新判定状态
                                            const sumSql = `
                                                SELECT COALESCE(SUM(received_amount), 0) AS total_received
                                                FROM rent_received_records
                                                WHERE bill_id = ?
                                            `;

                                            db.query(sumSql, [existingBillId], (sumErr, sumRows) => {
                                                if (sumErr) {
                                                    console.error(`查询客户 ${customerId} 历史实收金额失败:`, sumErr);
                                                    periodsProcessed++;
                                                    checkPeriodComplete();
                                                    return;
                                                }

                                                const totalReceived = parseFloat((sumRows[0] && sumRows[0].total_received) || 0);
                                                const billAmount = totalAmount;
                                                const discountAmount = existingDiscount || 0;
                                                const settledAmount = totalReceived + discountAmount;
                                                const newStatus = settledAmount >= billAmount - 0.01 ? 'paid' : 'unpaid';

                                                const updateSql = `
                                                    UPDATE customer_bills
                                                    SET amount = ?, status = ?, item_count = ?, updated_at = CURRENT_TIMESTAMP
                                                    WHERE id = ?
                                                `;

                                                db.query(updateSql, [billAmount.toFixed(2), newStatus, itemCount, existingBillId], (updateErr) => {
                                                    if (updateErr) {
                                                        console.error(`更新客户 ${customerId} 账单失败:`, updateErr);
                                                    } else {
                                                        console.log(`  ✓ 客户 ${customerId} 更新账单(ID=${existingBillId}): ${period.start} ~ ${period.end}, 新金额: ${billAmount.toFixed(2)}, 已收: ${totalReceived.toFixed(2)}, 折扣: ${discountAmount.toFixed(2)}, 状态: ${newStatus}`);
                                                    }
                                                    periodsProcessed++;
                                                    checkPeriodComplete();
                                                });
                                            });
                                        }
                                    });
                                });
                            });


                            function checkPeriodComplete() {
                                if (periodsProcessed === periods.length) {
                                    groupsProcessed++;
                                    checkCustomerComplete();
                                }
                            }
                        });

                        function checkCustomerComplete() {
                            if (groupsProcessed === totalGroups) {
                                console.log(`客户 ${customerId} 完成，生成 ${customerBillsCreated} 张账单`);
                                totalBillsCreated += customerBillsCreated;
                                customerResults.push({ customerId, billsCreated: customerBillsCreated });
                                customersProcessed++;
                                checkAllComplete();
                            }
                        }
                    }
                );
            });

            function checkAllComplete() {
                if (customersProcessed === totalCustomers) {
                    console.log(`\n==== 批量生成完成，共处理 ${totalCustomers} 个客户，生成 ${totalBillsCreated} 张账单 ====\n`);
                    
                    const successCount = customerResults.filter(r => !r.error).length;
                    const details = `处理客户数：${totalCustomers}\n成功：${successCount}\n共生成账单：${totalBillsCreated} 张`;
                    
                    res.json({
                        success: true,
                        message: `账单批量生成完成！`,
                        details: details,
                        totalBillsCreated: totalBillsCreated,
                        totalCustomers: totalCustomers,
                        results: customerResults
                    });
                }
            }
        }
    );
});

// ============================================
// Autocomplete API 路由（统一的联想搜索接口）
// ============================================



// 设备编号 autocomplete

app.get('/api/autocomplete/devices', isAuthenticated, (req, res) => {
    const keyword = req.query.q || '';
    const limit = parseInt(req.query.limit) || 10;
    
    const query = `
        SELECT device_code as value, 
               CONCAT(device_code, ' - ', device_name) as label
        FROM devices
        WHERE device_code LIKE ? OR device_name LIKE ? OR serial_number LIKE ?
        GROUP BY device_code, device_name
        ORDER BY device_code
        LIMIT ?
    `;
    
    const searchTerm = `%${keyword}%`;
    db.query(query, [searchTerm, searchTerm, searchTerm, limit], (err, results) => {
        if (err) {
            console.error('设备搜索API错误:', err);
            return res.json({ success: false, data: [] });
        }
        res.json({ success: true, data: results });
    });
});

// 配件名称 autocomplete
app.get('/api/autocomplete/accessories', isAuthenticated, (req, res) => {
    const keyword = req.query.q || '';
    const limit = parseInt(req.query.limit) || 10;
    
    const query = `
        SELECT 
            a.id,
            a.name AS value,
            CONCAT(a.name, ' - ', a.brand, ' ', a.model) AS label,
            a.unit_price
        FROM accessories a
        WHERE a.name LIKE ? OR a.brand LIKE ? OR a.model LIKE ?
        GROUP BY a.id, a.name, a.brand, a.model, a.unit_price
        ORDER BY a.name
        LIMIT ?
    `;
    
    const searchTerm = `%${keyword}%`;
    db.query(query, [searchTerm, searchTerm, searchTerm, limit], (err, results) => {
        if (err) {
            console.error('配件搜索API错误:', err);
            return res.json({ success: false, data: [] });
        }
        res.json({ success: true, data: results });
    });
});

// 产品（设备） autocomplete
app.get('/api/autocomplete/products', isAuthenticated, (req, res) => {
    const keyword = req.query.q || '';
    const limit = parseInt(req.query.limit) || 10;

    const query = `
        SELECT 
            p.id,
            p.name AS value,
            CONCAT(p.name, ' - ', p.brand, ' ', p.model) AS label,
            p.purchase_price
        FROM products p
        WHERE p.name LIKE ? OR p.brand LIKE ? OR p.model LIKE ?
        GROUP BY p.id, p.name, p.brand, p.model, p.purchase_price
        ORDER BY p.name
        LIMIT ?
    `;

    const searchTerm = `%${keyword}%`;
    db.query(query, [searchTerm, searchTerm, searchTerm, limit], (err, results) => {
        if (err) {
            console.error('产品搜索API错误:', err);
            return res.json({ success: false, data: [] });
        }
        res.json({ success: true, data: results });
    });
});

// 批次号 autocomplete
app.get('/api/autocomplete/batches', isAuthenticated, (req, res) => {
    const keyword = req.query.q || '';
    const limit = parseInt(req.query.limit) || 10;
    
    const query = `
        SELECT ab.batch_no as value,
               CONCAT(ab.batch_no, ' - ', s.name) as label
        FROM accessory_batches ab
        LEFT JOIN suppliers s ON ab.supplier_id = s.id
        WHERE ab.batch_no LIKE ?
        GROUP BY ab.batch_no, s.name
        ORDER BY ab.batch_no DESC
        LIMIT ?
    `;
    
    const searchTerm = `%${keyword}%`;
    db.query(query, [searchTerm, limit], (err, results) => {
        if (err) {
            console.error('批次号搜索API错误:', err);
            return res.json({ success: false, data: [] });
        }
        res.json({ success: true, data: results });
    });
});

// 供应商 autocomplete
app.get('/api/autocomplete/suppliers', isAuthenticated, (req, res) => {
    const keyword = req.query.q || '';
    const limit = parseInt(req.query.limit) || 10;
    
    const query = `
        SELECT id, name as value, name as label
        FROM suppliers
        WHERE name LIKE ? OR contact_person LIKE ?
        GROUP BY id, name
        ORDER BY name
        LIMIT ?
    `;
    
    const searchTerm = `%${keyword}%`;
    db.query(query, [searchTerm, searchTerm, limit], (err, results) => {
        if (err) {
            console.error('供应商搜索API错误:', err);
            return res.json({ success: false, data: [] });
        }
        res.json({ success: true, data: results });
    });
});

// 订单号 autocomplete
app.get('/api/autocomplete/orders', isAuthenticated, (req, res) => {
    const keyword = req.query.q || '';
    const limit = parseInt(req.query.limit) || 10;
    
    const query = `
        SELECT ro.order_number as value,
               CONCAT(ro.order_number, ' - ', c.name) as label
        FROM rental_orders ro
        LEFT JOIN customers c ON ro.customer_id = c.id
        WHERE ro.order_number LIKE ?
        GROUP BY ro.order_number, c.name
        ORDER BY ro.created_at DESC
        LIMIT ?
    `;
    
    const searchTerm = `%${keyword}%`;
    db.query(query, [searchTerm, limit], (err, results) => {
        if (err) {
            console.error('订单搜索API错误:', err);
            return res.json({ success: false, data: [] });
        }
        res.json({ success: true, data: results });
    });
});

// 客户名称 autocomplete
app.get('/api/autocomplete/customers', isAuthenticated, (req, res) => {
    const keyword = req.query.q || '';
    const limit = parseInt(req.query.limit) || 10;
    
    const query = `
        SELECT 
            c.id, 
            COALESCE(ca.customer_code, '') as customer_code,
            c.name as value,
            CONCAT(COALESCE(ca.customer_code, ''), ' - ', c.name) as label
        FROM customers c
        LEFT JOIN customer_accounts ca ON c.id = ca.customer_id
        WHERE ca.customer_code LIKE ? OR c.name LIKE ? OR c.contact_person LIKE ?
        GROUP BY c.id, ca.customer_code, c.name
        ORDER BY ca.customer_code
        LIMIT ?
    `;
    
    const searchTerm = `%${keyword}%`;
    db.query(query, [searchTerm, searchTerm, searchTerm, limit], (err, results) => {
        if (err) {
            console.error('客户搜索API错误:', err);
            return res.json({ success: false, data: [] });
        }
        res.json({ success: true, data: results });
    });
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
    
    // ========== 租金管理定时任务（保留） ==========
    const schedule = require('node-schedule');
    const rentManagementTask = require('./rent-management-cron');
    
    // 设置定时任务：每天凌晨3点执行
    const rentManagementJob = schedule.scheduleJob('0 3 * * *', function() {
        console.log('\n[定时任务] 开始执行租金管理任务');
        rentManagementTask.executeRentManagementTasks();
    });
    
    console.log('✓ 租金管理定时任务已启动（每天凌晨3点执行：更新逾期状态、生成预警）');
    
    // 每日扣费任务改为完全手工触发：在客户消费页面点击“刷新/生成”按钮
    // 不再在这里启动每天 2 点自动扣费的定时任务
    
    // 测试：可以手动触发任务
    // const dailyChargeTask = require('./daily-charge-task');
    // dailyChargeTask.executeDailyCharge();
    // rentManagementTask.executeRentManagementTasks();

    
    // 检查并创建采购管理相关表
    db.query('SHOW TABLES LIKE "purchase_batches"', (err, result) => {
        if (err) {
            console.error('检查采购表失败:', err);
            return;
        }
        
        if (result.length === 0) {
            console.warn('采购管理表不存在，请手动执行 purchase-tables.sql 或相关初始化脚本来创建采购管理相关数据表。');
        }

    });
});