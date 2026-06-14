// js/invoice.js

(function () {
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatCurrency(amount, currency = "INR") {
    const value = parseFloat(amount || 0);

    if (currency === "USD") {
      return "$" + value.toFixed(2);
    }

    return "₹" + value.toFixed(2);
  }

  function getCountry(order) {
    return order.shippingCountry || order.country || order.ipCountry || "IN";
  }

  function getCurrency(order) {
    return getCountry(order) === "IN" ? "INR" : "USD";
  }

  function getItemPrice(item, order) {
    const country = getCountry(order);

    const indiaPrice = parseFloat(item.indiaPrice || item.price || 0);

    const intlPrice = parseFloat(
      item.internationalPrice || item.intlPrice || item.price || indiaPrice,
    );

    return country === "IN" ? indiaPrice : intlPrice;
  }

  function getAddress(order) {
    const a = order.shippingAddress || {};

    return [
      a.name,
      a.addressLine1,
      a.addressLine2,
      [a.city, a.state, a.postalCode].filter(Boolean).join(", "),
      a.country,
    ]
      .filter(Boolean)
      .join("<br>");
  }

  function generateInvoice(order) {
    if (!order) return;

    const currency = getCurrency(order);

    const items = order.items || [];

    let subtotal = 0;

    const rows = items
      .map((item) => {
        const qty = Number(item.quantity || item.qty || 1);

        const unitPrice = getItemPrice(item, order);

        const lineTotal = unitPrice * qty;

        subtotal += lineTotal;

        return `
          <tr>
            <td>
              ${escapeHtml(item.name || item.productName || "Product")}
            </td>
            <td>${qty}</td>
            <td>${formatCurrency(unitPrice, currency)}</td>
            <td>${formatCurrency(lineTotal, currency)}</td>
          </tr>
        `;
      })
      .join("");

    const total = parseFloat(order.totalAmount) || subtotal;

    const invoiceWindow = window.open("", "_blank", "width=1200,height=900");

    if (!invoiceWindow) {
      alert("Please allow popups to print invoice.");
      return;
    }

    invoiceWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice - ${escapeHtml(order.orderId || "")}</title>

<style>

*{
margin:0;
padding:0;
box-sizing:border-box;
}

body{
font-family:Arial,sans-serif;
background:#f5f5f5;
padding:40px;
color:#222;
}

.invoice{
max-width:1100px;
margin:auto;
background:#fff;
border-radius:16px;
padding:40px;
box-shadow:0 4px 20px rgba(0,0,0,.08);
}

.header{
display:flex;
justify-content:space-between;
align-items:flex-start;
margin-bottom:40px;
border-bottom:2px solid #eee;
padding-bottom:20px;
}

.brand h1{
font-size:42px;
color:#009640;
margin-bottom:8px;
}

.brand p{
color:#777;
}

.invoice-meta{
text-align:right;
}

.invoice-meta h2{
font-size:28px;
margin-bottom:10px;
}

.invoice-meta p{
margin:4px 0;
color:#666;
}

.grid{
display:grid;
grid-template-columns:1fr 1fr;
gap:20px;
margin-bottom:35px;
}

.card{
border:1px solid #e5e5e5;
border-radius:12px;
padding:20px;
}

.card-title{
font-size:14px;
font-weight:700;
text-transform:uppercase;
color:#888;
margin-bottom:12px;
}

.card-content{
font-size:16px;
line-height:1.7;
}

table{
width:100%;
border-collapse:collapse;
margin-top:10px;
}

thead{
background:#009640;
color:white;
}

th{
padding:14px;
text-align:left;
}

td{
padding:14px;
border-bottom:1px solid #eee;
}

tfoot td{
font-weight:bold;
}

.summary{
width:350px;
margin-left:auto;
margin-top:25px;
}

.summary-row{
display:flex;
justify-content:space-between;
padding:10px 0;
}

.grand-total{
font-size:24px;
font-weight:bold;
border-top:2px solid #222;
margin-top:10px;
padding-top:15px;
}

.footer{
margin-top:50px;
text-align:center;
color:#888;
font-size:13px;
}

.print-btn{
background:#009640;
color:white;
border:none;
padding:12px 24px;
border-radius:8px;
cursor:pointer;
font-size:15px;
margin-bottom:25px;
}

@media print{

body{
background:white;
padding:0;
}

.print-btn{
display:none;
}

.invoice{
box-shadow:none;
padding:0;
max-width:100%;
}

}

</style>
</head>

<body>

<button class="print-btn" onclick="window.print()">
🖨 Print Invoice
</button>

<div class="invoice">

<div class="header">

<div class="brand">
<img
src="assets/images/union0.svg"
style="height:80px;margin-bottom:10px"
/>

<h1>Gujjuben's Khakhra</h1>
<p>Authentic Gujarati Snacks</p>
</div>

<div class="invoice-meta">
<h2>INVOICE</h2>

<p>
<strong>Invoice #</strong>
${escapeHtml(order.orderId || "")}
</p>

<p>
<strong>Date:</strong>
${new Date(order.createdAt || Date.now()).toLocaleString()}
</p>

<p>
<strong>Status:</strong>
${escapeHtml(order.statusText || order.status || "Confirmed")}
</p>

</div>

</div>

<div class="grid">

<div class="card">
<div class="card-title">
Customer Details
</div>

<div class="card-content">
${escapeHtml(order.customerName || order.userName || "")}<br>

${escapeHtml(order.customerEmail || "")}<br>

${escapeHtml(order.customerPhone || "")}
</div>
</div>

<div class="card">
<div class="card-title">
Shipping Address
</div>

<div class="card-content">
${getAddress(order)}
</div>
</div>

</div>

<table>

<thead>
<tr>
<th>Product</th>
<th>Qty</th>
<th>Unit Price</th>
<th>Total</th>
</tr>
</thead>

<tbody>
${rows}
</tbody>

</table>

<div class="summary">

<div class="summary-row">
<span>Subtotal</span>
<span>${formatCurrency(subtotal, currency)}</span>
</div>

<div class="summary-row">
<span>Shipping</span>
<span>Free</span>
</div>

<div class="summary-row grand-total">
<span>Total</span>
<span>${formatCurrency(total, currency)}</span>
</div>

</div>

<div class="footer">
Thank you for shopping with
Gujjuben's Khakhra ❤️
</div>

</div>

</body>
</html>
`);

    invoiceWindow.document.close();
  }

  window.generateInvoice = generateInvoice;

  console.log("✅ Invoice generator loaded");
})();
