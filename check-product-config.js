const mysql = require('mysql');

// 创建数据库连接
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system'
});

connection.connect(err => {
  if (err) {
    console.error('连接数据库失败:', err);
    process.exit(1);
  }
  console.log('已连接到数据库');
  
  // 检查产品PC0003-剪辑电脑1pro的信息
  connection.query(
    'SELECT id, name, product_code FROM products WHERE name LIKE "%剪辑电脑1pro%" OR product_code = "PC0003"', 
    (err, products) => {
      if (err) {
        console.error('查询产品错误:', err);
        connection.end();
        return;
      }
      
      console.log('\n=== 产品信息 ===');
      console.log(products);
      
      if (products.length === 0) {
        console.log('未找到产品PC0003-剪辑电脑1pro');
        connection.end();
        return;
      }
      
      const product = products[0];
      
      // 检查设备模板
      connection.query(
        'SELECT * FROM device_templates WHERE product_code = ?',
        [product.product_code || product.code],
        (err, templates) => {
          if (err) {
            console.error('查询设备模板错误:', err);
            connection.end();
            return;
          }
          
          console.log('\n=== 设备模板记录数 ===', templates.length);
          if (templates.length > 0) {
            console.log('模板记录:');
            console.log(templates);
          }
          
          // 模拟产品配置API的查询
          connection.query(`
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
          `, [product.product_code || product.code], (err, rows) => {
            if (err) {
              console.error('查询产品配置错误:', err);
              connection.end();
              return;
            }
            
            console.log('\n=== 产品配置查询结果 ===');
            console.log(`总记录数: ${rows.length}`);
            console.log('详细记录:');
            
            // 按类别分组统计
            const categories = {};
            rows.forEach(row => {
              const catName = row.category_name || row.accessory_name || '未知类别';
              if (!categories[catName]) {
                categories[catName] = {
                  template: 0,
                  hasAccessory: 0,
                  noAccessory: 0
                };
              }
              
              categories[catName].template++;
              if (row.accessory_id) {
                categories[catName].hasAccessory++;
              } else {
                categories[catName].noAccessory++;
              }
            });
            
            console.log('\n=== 类别统计 ===');
            Object.keys(categories).forEach(catName => {
              const stats = categories[catName];
              console.log(`${catName}: 模板${stats.template}个, 有配件${stats.hasAccessory}个, 缺少配件${stats.noAccessory}个`);
            });
            
            connection.end();
          });
        }
      );
    }
  );
});