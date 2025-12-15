// 测试渲染客户搜索代码
const customers = [
    { id: 3, name: "厦门海纳千川科技有限公司", contact_person: "李伟聪", phone: "" }
];

console.log('测试JSON序列化:');
console.log(JSON.stringify(customers));

console.log('\n测试渲染HTML:');

let html = '';
customers.forEach(function(customer) {
    html += '<a class="dropdown-item" href="javascript:void(0)" onclick="selectCustomer(' + customer.id + ')">';
    html += '<div><strong>' + (customer.name || '') + '</strong></div>';
    html += '<small class="text-muted">';
    html += (customer.contact_person || '-') + ' | ' + (customer.phone || '-');
    html += '</small>';
    html += '</a>';
});

console.log(html);

console.log('\n测试过滤:');
const searchText = '厦门';
const filteredCustomers = customers.filter(function(customer) {
    const name = (customer.name || '').toLowerCase();
    const contact = (customer.contact_person || '').toLowerCase();
    const phone = (customer.phone || '').toLowerCase();
    return name.includes(searchText.toLowerCase()) || 
           contact.includes(searchText.toLowerCase()) || 
           phone.includes(searchText.toLowerCase());
});

console.log('搜索"' + searchText + '"，找到', filteredCustomers.length, '个结果');
console.log(filteredCustomers);
