const mysql = require('mysql');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    charset: 'utf8mb4'
});

connection.connect();

// 检查并添加缺失的列
const alterStatements = [
    // 检查每个列是否存在，不存在则添加
    "SET @dbname = 'rental_system';",
    "SET @tablename = 'products';",
    
    // 检查并添加 printer_type 列
    `SET @columnname = 'printer_type'; SET @preparedStatement = (SELECT IF(
        (
            SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE
                (table_schema = @dbname)
                AND (table_name = @tablename)
                AND (column_name = @columnname)
        ) > 0,
        'SELECT 1',
        CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(100) COMMENT \\'打印机类型\\'')
    ));
    PREPARE alterIfNotExists FROM @preparedStatement;
    EXECUTE alterIfNotExists;
    DEALLOCATE PREPARE alterIfNotExists;`,
    
    // 检查并添加 is_custom_config 列
    `SET @columnname = 'is_custom_config'; SET @preparedStatement = (SELECT IF(
        (
            SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE
                (table_schema = @dbname)
                AND (table_name = @tablename)
                AND (column_name = @columnname)
        ) > 0,
        'SELECT 1',
        CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' BOOLEAN DEFAULT FALSE COMMENT \\'是否为自定义配置\\'')
    ));
    PREPARE alterIfNotExists FROM @preparedStatement;
    EXECUTE alterIfNotExists;
    DEALLOCATE PREPARE alterIfNotExists;`,
    
    // 检查并添加 total_price 列
    `SET @columnname = 'total_price'; SET @preparedStatement = (SELECT IF(
        (
            SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE
                (table_schema = @dbname)
                AND (table_name = @tablename)
                AND (column_name = @columnname)
        ) > 0,
        'SELECT 1',
        CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10,2) DEFAULT 0.00 COMMENT \\'总价格（配件组合时使用）\\'')
    ));
    PREPARE alterIfNotExists FROM @preparedStatement;
    EXECUTE alterIfNotExists;
    DEALLOCATE PREPARE alterIfNotExists;`,
    
    // 检查并添加 calculated_daily_rent 列
    `SET @columnname = 'calculated_daily_rent'; SET @preparedStatement = (SELECT IF(
        (
            SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE
                (table_schema = @dbname)
                AND (table_name = @tablename)
                AND (column_name = @columnname)
        ) > 0,
        'SELECT 1',
        CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10,2) DEFAULT 0.00 COMMENT \\'计算得出的日租金\\'')
    ));
    PREPARE alterIfNotExists FROM @preparedStatement;
    EXECUTE alterIfNotExists;
    DEALLOCATE PREPARE alterIfNotExists;`,
    
    // 检查并添加 calculated_monthly_rent 列
    `SET @columnname = 'calculated_monthly_rent'; SET @preparedStatement = (SELECT IF(
        (
            SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE
                (table_schema = @dbname)
                AND (table_name = @tablename)
                AND (column_name = @columnname)
        ) > 0,
        'SELECT 1',
        CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10,2) DEFAULT 0.00 COMMENT \\'计算得出的月租金\\'')
    ));
    PREPARE alterIfNotExists FROM @preparedStatement;
    EXECUTE alterIfNotExists;
    DEALLOCATE PREPARE alterIfNotExists;`
];

function executeStatements(index) {
    if (index >= alterStatements.length) {
        console.log('数据库表结构更新完成');
        connection.end();
        return;
    }
    
    const statement = alterStatements[index];
    console.log('执行语句:', statement.substring(0, 50) + '...');
    
    connection.query(statement, (err, result) => {
        if (err) {
            console.error('执行错误:', err.message);
        } else {
            console.log('执行成功');
        }
        
        // 继续执行下一个语句
        executeStatements(index + 1);
    });
}

executeStatements(0);