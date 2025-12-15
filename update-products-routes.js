const fs = require('fs');

// 读取server.js文件
fs.readFile('server.js', 'utf8', (err, data) => {
    if (err) {
        console.error('读取server.js文件失败:', err);
        return;
    }
    
    // 找到产品相关的路由部分
    const startMarker = "// 添加产品页面";
    const endMarker = "// 编辑产品页面";
    
    const startIndex = data.indexOf(startMarker);
    const endIndex = data.indexOf(endMarker);
    
    if (startIndex === -1 || endIndex === -1) {
        console.error('未找到产品路由标记');
        return;
    }
    
    // 新的产品路由代码
    const newProductRoutes = `
// 产品管理页面
app.get('/products', isAuthenticated, (req, res) => {
    // 获取所有产品
    db.query(\`
        SELECT p.*, c.name as category_name 
        FROM products p 
        LEFT JOIN product_categories c ON p.category_id = c.id 
        ORDER BY p.created_at DESC
    \`, (err, products) => {
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
            
            res.render('products/index', { 
                products: products,
                categories: categories,
                user: req.session.user,
                active: 'products',
                pageTitle: '产品管理'
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
                db.query('SELECT * FROM accessories WHERE category_id = (SELECT id FROM accessory_categories WHERE name = ?)', 
                    [categoryName], (err, results) => {
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

// 添加产品
app.post('/products/add', isAuthenticated, (req, res) => {
    const { 
        category_id, 
        name, 
        brand, 
        model, 
        specifications, 
        purchase_price,
        total_price,
        calculated_daily_rent,
        calculated_monthly_rent
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
        const productData = {
            category_id: category_id,
            name: name,
            brand: brand || null,
            model: model || null,
            specifications: specifications || null,
            total_price: total_price || purchase_price || 0,
            calculated_daily_rent: calculated_daily_rent || 0,
            calculated_monthly_rent: calculated_monthly_rent || 0
        };
        
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
                        }
                    });
                }
            }
            
            res.redirect('/products');
        });
    });
});

`;

    // 替换路由代码
    const newContent = data.substring(0, startIndex) + newProductRoutes + data.substring(endIndex);
    
    // 写回文件
    fs.writeFile('server.js', newContent, 'utf8', (err) => {
        if (err) {
            console.error('写入server.js文件失败:', err);
            return;
        }
        
        console.log('产品路由更新成功！');
    });
});