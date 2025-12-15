const http = require('http');

// 测试产品配置API
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/products/config/6',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  console.log(`状态码: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      console.log('响应成功:', response.success);
      
      if (response.success) {
        console.log('配件数量:', response.accessories ? response.accessories.length : 0);
        
        if (response.accessories && response.accessories.length > 0) {
          console.log('\n配件列表:');
          response.accessories.forEach(acc => {
            console.log(`- ${acc.category_name}: ${acc.brand} ${acc.model} (库存: ${acc.stock_quantity})`);
          });
          console.log(`\n总价格: ¥${response.total_price}`);
        } else {
          console.log('该产品未维护详细配件清单');
          console.log(`总价格: ¥${response.total_price}`);
        }
      }
    } catch (e) {
      console.error('解析响应失败:', e);
      console.log('原始响应:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('请求失败:', error.message);
});

req.end();