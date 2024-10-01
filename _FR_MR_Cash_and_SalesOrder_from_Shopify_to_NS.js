/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/https', 'N/record', 'N/search', '/SuiteScripts/moment.js'], function (https, record, search, moment) {

    // Define your script parameters here
    var shopifyAccessToken = '###############';
    var shopifyShopDomain = '###############';

    function getInputData() {
        try {
            var todayDate = new Date();
            todayDate = moment(todayDate).format('YYYY-MM-DDT00:00:00[Z]');
            log.debug('todayDate', todayDate);

            var shopifyResponse = https.get({
                url: 'https://' + shopifyShopDomain + '/admin/api/2023-07/orders.json?fulfillment_status=shipped&created_at_min=' + todayDate + '',
                headers: {
                    'X-Shopify-Access-Token': shopifyAccessToken
                }
            });

            var ordersData = JSON.parse(shopifyResponse.body);
            log.debug('ordersData', ordersData.orders);
            return ordersData.orders;

        }

        catch (e) {
            log.error('Error', e);
        }
    }

    function map(context) {
        try {
            var shopifyOrder = JSON.parse(context.value);
            log.debug('shopifyOrder', shopifyOrder);
            //first check if the order is already created
            var id = shopifyOrder.id;
            log.debug('id', id);


            var cashSaleIds = checkDuplicateCashSale(id);
            log.debug('cashSaleId', cashSaleIds);
            if (!cashSaleIds) {
                var cashSaleId = createCashSales(shopifyOrder);
                log.debug('cashSaleId', cashSaleId);
            }

            if (cashSaleIds) {
                log.debug('cashSaleIdinIF', cashSaleIds);
                log.debug('Duplicate Cash Sale', 'Cash Sale ID: ' + cashSaleIds + ' already exists in NetSuite as Cash Sale ID: ' + cashSaleIds);
                return;
            }

        }
        catch (e) {
            log.error('Error', e);
        }
    }


    function reduce(context) {
        // Implement reduce logic if needed
    }

    function summarize(summary) {
        // Implement summarize logic if needed
    }
    // function findCustId(email) {
    //     var customerSearchObj = search.create({
    //         type: "customer",
    //         filters: [
    //             ["email", "is", email]
    //         ],
    //         columns: [
    //             search.createColumn({ name: "internalid" })
    //         ]
    //     });

    //     var custId = '';

    //     customerSearchObj.run().each(function (result) {
    //         custId = result.getValue({
    //             name: 'internalid'
    //         });
    //     })

    //     return custId ? custId : null;
    // }

    function checkDuplicateCashSale(shopifyOrderId) {
        log.debug('shopifyOrderId', shopifyOrderId);
        var cashSaleSearchObj = search.create({
            type: "cashsale",
            filters: [
                ["type", "anyof", "CashSale"],
                "AND",
                ["custbody_shopify_order_id", "is", shopifyOrderId.toString()],
                "AND",
                ["mainline", "is", "T"]

            ],
            columns: [
                search.createColumn({ name: "internalid" })
            ]
        });
        var cashSaleId = '';
        cashSaleSearchObj.run().each(function (result) {
            cashSaleId = result.getValue({
                name: 'internalid'
            });

        })
        log.debug('cashSaleIdinSearch', cashSaleId);
        return cashSaleId ? cashSaleId : null;
    }

    function createCashSales(shopifyOrder) {
        var cashsale = record.create({
            type: record.Type.CASH_SALE,
            isDynamic: true
        });

        // var custEmail = shopifyOrder.customer.email;
        // var customerId = findCustId(custEmail);
        cashsale.setValue({
            fieldId: 'entity',
            value: 2704
        });
        cashsale.setValue({
            fieldId: 'customform',
            value: 146
        });
        var tranid = shopifyOrder.order_number;
        cashsale.setValue({
            fieldId: 'tranid',
            value: "OL-TX-" + tranid
        });

        cashsale.setValue({
            fieldId: 'trandate',
            value: new Date()
        });
        cashsale.setText({
            fieldId: 'memo',
            text: 'Cash Sale from Shopify'
        });

        cashsale.setValue({
            fieldId: 'location',
            value: 16
        });
        var address = shopifyOrder.shipping_address.first_name + " " + shopifyOrder.shipping_address.last_name + " "
            + shopifyOrder.shipping_address.address1 + " " + shopifyOrder.shipping_address.city + " " + shopifyOrder.shipping_address.country;
        log.debug('address', address);
        var phone = shopifyOrder.shipping_address.phone;
        log.debug('phone', phone);
        cashsale.setValue({
            fieldId: 'custbody_da_ws_cust_address',
            value: address
        });
        cashsale.setValue({
            fieldId: 'custbody_da_cust_mobile_no',
            value: phone
        });

        cashsale.setValue({
            fieldId: 'shipaddresslist',
            value: shopifyOrder.shipping_address.id
        });
        cashsale.setValue({
            fieldId: 'undepfunds',
            value: "T"
        });
        cashsale.setValue({
            fieldId: 'account',
            value: 453
        });
        cashsale.setValue({
            fieldId: 'custbody_shopify_order_id',
            value: shopifyOrder.id.toString()
        });
        cashsale.setValue({
            fieldId: 'custbody_shopify_order_total',
            value: shopifyOrder.total_price.toString()
        });
        cashsale.setValue({
            fieldId: 'custbody_shopify_order_number',
            value: shopifyOrder.order_number
        });

        // Loop through the line items
        for (var i = 0; i < shopifyOrder.line_items.length; i++) {
            // Create a new line item
            cashsale.selectNewLine({
                sublistId: 'item',
            });
            var itemId = findItemId(shopifyOrder.line_items[i].sku);


            cashsale.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                value: itemId
            });
            cashsale.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'quantity',
                value: shopifyOrder.line_items[i].quantity
            });
            //add item country from billing address
            cashsale.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'location',
                value: 16
            });



            cashsale.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'rate',
                value: shopifyOrder.line_items[i].price
            });

            cashsale.commitLine({
                sublistId: 'item'
            });
        }

        var cashsaleId = cashsale.save({
            enableSourcing: true,
            ignoreMandatoryFields: true,
        });
        log.debug('Created Cash Sale', 'cashsale:' + cashsaleId);
        return cashsaleId;
    }
    function findItemId(itemName) {
        log.debug("itemname", itemName)
        var itemSearchObj = search.create({
            type: "item",
            filters: [
                ["name", "is", itemName]
            ],
            columns: [
                search.createColumn({ name: "internalid" })
            ]
        });
        var itemId = '';
        itemSearchObj.run().each(function (result) {
            itemId = result.getValue({
                name: 'internalid'
            });
        })
        return itemId ? itemId : null;
    }
    // function createCustomer(shopifyOrder) {
    //     var customer = record.create({
    //         type: record.Type.CUSTOMER,
    //         isDynamic: true
    //     });
    //     customer.setValue({
    //         fieldId: 'email',
    //         value: shopifyOrder.customer.email
    //     });
    //     customer.setValue({
    //         fieldId: 'firstname',
    //         value: shopifyOrder.customer.first_name
    //     });
    //     customer.setValue({
    //         fieldId: 'lastname',
    //         value: shopifyOrder.customer.last_name,
    //     });

    //     customer.setValue({
    //         fieldId: 'isperson',
    //         value: "T"
    //     });
    //     customer.setValue({
    //         fieldId: 'subsidiary',
    //         value: 5
    //     });
    //     customer.setValue({
    //         fieldId: 'phone',
    //         value: shopifyOrder.customer.phone
    //     });
    //     customer.setValue({
    //         fieldId: 'addr1',
    //         value: shopifyOrder.customer.default_address.address1
    //     });
    //     customer.setValue({
    //         fieldId: 'city',
    //         value: shopifyOrder.customer.default_address.city
    //     });
    //     customer.setValue({
    //         fieldId: 'state',
    //         value: shopifyOrder.customer.default_address.province
    //     });
    //     customer.setValue({
    //         fieldId: 'zip',
    //         value: shopifyOrder.customer.default_address.zip
    //     });
    //     customer.setValue({
    //         fieldId: 'country',
    //         value: shopifyOrder.customer.default_address.country
    //     });

    //     var customerId = customer.save({
    //         enableSourcing: true,
    //         ignoreMandatoryFields: true
    //     });

    //     log.debug('Created Customer', 'Customer ID: ' + customerId);
    //     return customerId;
    // }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }

});