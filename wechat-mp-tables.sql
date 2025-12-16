USE rental_system;

-- 微信小程序客户绑定表
CREATE TABLE IF NOT EXISTS wechat_customers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    openid VARCHAR(64) NOT NULL COMMENT '微信用户 openid',
    unionid VARCHAR(64) NULL COMMENT '微信 unionid（如有开放平台绑定）',
    customer_id INT NULL COMMENT '绑定的客户ID，可为空表示尚未绑定',
    contact_name VARCHAR(100) NULL COMMENT '联系人姓名',
    mobile VARCHAR(20) NULL COMMENT '联系人手机号',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_openid (openid),
    INDEX idx_customer_id (customer_id),
    CONSTRAINT fk_wechat_customers_customer
        FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信小程序用户与客户绑定表';

-- 微信小程序会话表（用于发放后端 token）
CREATE TABLE IF NOT EXISTS wechat_mp_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    token VARCHAR(64) NOT NULL COMMENT '后端颁发的会话 token',
    openid VARCHAR(64) NOT NULL COMMENT '微信 openid',
    customer_id INT NULL COMMENT '当前会话绑定的客户ID，可为空',
    expires_at DATETIME NOT NULL COMMENT '过期时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_token (token),
    INDEX idx_openid (openid),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信小程序会话表';
