const mysql = require('mysql');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

connection.connect(err => {
    if (err) {
        console.error('连接MySQL服务器失败:', err);
        return;
    }
    console.log('已连接到MySQL服务器');
    
    // 更新产品类别表，只保留台式电脑和笔记本
    connection.query('DELETE FROM product_categories', (err) => {
        if (err) {
            console.error('清空产品类别失败:', err);
            connection.end();
            return;
        }
        console.log('已清空产品类别表');
        
        // 重新插入基础类别
        connection.query(`
            INSERT INTO product_categories (name, description) VALUES 
            ('台式电脑', '各类品牌台式电脑'),
            ('笔记本电脑', '各类品牌笔记本电脑')
        `, (err) => {
            if (err) {
                console.error('插入基础产品类别失败:', err);
                connection.end();
                return;
            }
            console.log('已插入基础产品类别');
            
            // 检查并更新产品表结构
            checkAndUpdateProductTable();
        });
    });
});

function checkAndUpdateProductTable() {
    // 检查表结构
    connection.query('DESCRIBE products', (err, result) => {
        if (err) {
            console.error('检查产品表结构失败:', err);
            connection.end();
            return;
        }
        
        const columns = result.map(col => col.Field);
        const updates = [];
        
        if (!columns.includes('specifications')) {
            updates.push('ADD COLUMN specifications JSON');
        }
        if (!columns.includes('total_price')) {
            updates.push('ADD COLUMN total_price DECIMAL(10,2)');
        }
        if (!columns.includes('calculated_daily_rent')) {
            updates.push('ADD COLUMN calculated_daily_rent DECIMAL(10,2)');
        }
        if (!columns.includes('calculated_monthly_rent')) {
            updates.push('ADD COLUMN calculated_monthly_rent DECIMAL(10,2)');
        }
        
        if (updates.length > 0) {
            const alterSql = `ALTER TABLE products ${updates.join(', ')}`;
            connection.query(alterSql, (err) => {
                if (err) {
                    console.error('更新产品表结构失败:', err);
                    connection.end();
                    return;
                }
                console.log('已更新产品表结构');
                createProductAccessoriesTable();
            });
        } else {
            console.log('产品表结构已是最新');
            createProductAccessoriesTable();
        }
    });
}

function createProductAccessoriesTable() {
    // 创建产品配件关联表
    connection.query(`
        CREATE TABLE IF NOT EXISTS product_accessories (
            id INT PRIMARY KEY AUTO_INCREMENT,
            product_id INT NOT NULL,
            accessory_id INT NOT NULL,
            quantity INT DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (accessory_id) REFERENCES accessories(id),
            UNIQUE KEY (product_id, accessory_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `, (err) => {
        if (err) {
            console.error('创建产品配件关联表失败:', err);
            connection.end();
            return;
        }
        console.log('已创建产品配件关联表');
        
        // 清空现有产品数据
        connection.query('DELETE FROM products', (err) => {
            if (err) {
                console.error('清空产品表失败:', err);
                connection.end();
                return;
            }
            console.log('已清空产品表');
            
            // 更新配件类别表
            updateAccessoryCategories();
        });
    });
}

function updateAccessoryCategories() {
    // 清空并重新插入配件类别
    connection.query('DELETE FROM accessory_categories', (err) => {
        if (err) {
            console.error('清空配件类别失败:', err);
            connection.end();
            return;
        }
        console.log('已清空配件类别表');
        
        connection.query(`
            INSERT INTO accessory_categories (name, description) VALUES 
            ('CPU', '中央处理器'),
            ('散热器', 'CPU散热器'),
            ('主板', '电脑主板'),
            ('内存', '内存条'),
            ('硬盘', '固态硬盘和机械硬盘'),
            ('显卡', '独立显卡'),
            ('机箱', '电脑机箱'),
            ('电源', '电脑电源'),
            ('显示器', '电脑显示器')
        `, (err) => {
            if (err) {
                console.error('插入配件类别失败:', err);
                connection.end();
                return;
            }
            console.log('已插入配件类别');
            
            // 创建资产统计表
            createAssetStatsTable();
        });
    });
}

function createAssetStatsTable() {
    connection.query(`
        CREATE TABLE IF NOT EXISTS asset_statistics (
            id INT PRIMARY KEY AUTO_INCREMENT,
            stat_date DATE NOT NULL,
            asset_type ENUM('device', 'accessory') NOT NULL,
            total_value DECIMAL(12,2) NOT NULL,
            total_count INT NOT NULL,
            depreciation_rate DECIMAL(5,4) DEFAULT 0.0000,
            monthly_depreciation DECIMAL(12,2) DEFAULT 0.00,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY (stat_date, asset_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `, (err) => {
        if (err) {
            console.error('创建资产统计表失败:', err);
            connection.end();
            return;
        }
        console.log('已创建资产统计表');
        
        // 创建折旧设置表
        createDepreciationSettingsTable();
    });
}

function createDepreciationSettingsTable() {
    connection.query(`
        CREATE TABLE IF NOT EXISTS depreciation_settings (
            id INT PRIMARY KEY AUTO_INCREMENT,
            asset_category VARCHAR(100) NOT NULL,
            depreciation_rate DECIMAL(5,4) NOT NULL,
            useful_life_months INT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY (asset_category)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `, (err) => {
        if (err) {
            console.error('创建折旧设置表失败:', err);
            connection.end();
            return;
        }
        console.log('已创建折旧设置表');
        
        // 插入默认折旧设置
        connection.query(`
            INSERT INTO depreciation_settings (asset_category, depreciation_rate, useful_life_months, description) VALUES 
            ('CPU', 0.0200, 36, 'CPU按5%月折旧率，36个月使用期'),
            ('散热器', 0.0200, 36, '散热器按5%月折旧率，36个月使用期'),
            ('主板', 0.0167, 48, '主板按4%月折旧率，48个月使用期'),
            ('内存', 0.0200, 36, '内存按5%月折旧率，36个月使用期'),
            ('硬盘', 0.0167, 48, '硬盘按4%月折旧率，48个月使用期'),
            ('显卡', 0.0167, 36, '显卡按4%月折旧率，36个月使用期'),
            ('机箱', 0.0100, 60, '机箱按2.5%月折旧率，60个月使用期'),
            ('电源', 0.0100, 48, '电源按2.5%月折旧率，48个月使用期'),
            ('显示器', 0.0100, 60, '显示器按2.5%月折旧率，60个月使用期'),
            ('整机', 0.0083, 60, '整机按1%月折旧率，60个月使用期')
            ON DUPLICATE KEY UPDATE 
            depreciation_rate = VALUES(depreciation_rate),
            useful_life_months = VALUES(useful_life_months),
            description = VALUES(description)
        `, (err) => {
            if (err) {
                console.error('插入折旧设置失败:', err);
                connection.end();
                return;
            }
            console.log('已插入折旧设置');
            
            console.log('数据库更新完成！');
            connection.end();
        });
    });
}