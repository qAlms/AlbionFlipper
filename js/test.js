async function fetchData(url) {
    //console.log(url);
    try {
        const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
    } catch (error) {
        console.error('Error fetching JSON:', error);
    }
}

async function extractItems() {
    let items = [];
    apiData = await fetchData('https://vekeng.github.io/AlbionFlipper/js/json/items.json');  // Wait for fetchData to complete
    apiData.forEach(item => {
        let itemTier, itemName, itemDescriptionEng;
        const [, itemEnchantment] = item.UniqueName.includes('@') ? item.UniqueName.split('@') : [item.UniqueName, 0];
        const itemID = item.UniqueName;
        const match = itemID.match(/^T(\d)/);
        if (match) {
            itemTier = parseInt(match[1]);
        } else {
            itemTier = 0;
        }
        if (item.LocalizedNames) {
            itemName = item.LocalizedNames['EN-US'];
        } else {
            itemName = "N/A"
        }
        if (item.LocalizedDescriptions) {
            itemDescriptionEng = item.LocalizedDescriptions['EN-US']; 
        } else { itemDescriptionEng = 'non-trad'; }
        if (itemTier && itemTier >= 4 && !itemDescriptionEng.includes("non-trad")) {
            items.push({ID: itemID, name: itemName, enchantment: itemEnchantment, tier: itemTier});
        }
    });
    return items;
}

async function getMarketData(region,cities,items) {
    let server;
    switch(region) {
        case 'europe': 
            server = 'https://europe.albion-online-data.com';
            break;
        case 'asia': 
            server = "https://east.albion-online-data.com";
            break;
        case 'americas': 
            server = "https://west.albion-online-data.com";
            break;
        default: 
            server = 'https://europe.albion-online-data.com';
    };
    const citiesString = cities.join(',');
    url = `${server}/api/v2/stats/Prices/${items}.json?locations=${cities}&qualities=0,1,2,3,4`
    return await fetchData(url)
}


async function main(server, tier, cities, marketAge, premium) {
    console.log("Start");
    console.log(server);
    console.log(tier);
    const taxModifier = 0.96; // Non-prem 0.92
    console.log("Age: ", marketAge);
    //const marketAge = 30;
    const items = await extractItems();
    const selectedItems = items
        .filter(item => tier.includes(item.tier))
        .map(item => item.ID);
    const chunkSize = 250; 
    const itemChunks = splitArrayIntoChunks(selectedItems, chunkSize);
    const allItems = [];
    for (const chunk of itemChunks) {
        const data = await getMarketData(server,cities,chunk);
        if (data) {
            allItems.push(...data);  // Merge the fetched data
        }
    }
    const profitableTrades = findProfitableTradesBetweenCities(allItems, cities, taxModifier, marketAge);
    const topProfitableTrades  = new Map();
    profitableTrades.forEach(trade => {
        const itemId = trade.itemId; 
        const profit = trade.profit;
        if (!topProfitableTrades.has(itemId) || profit > topProfitableTrades.get(itemId).profit) {
            // Update with the new trade if it has a higher profit
            topProfitableTrades.set(itemId, trade);
          }
    });
    const topProfitableTradesWithNames = fillNames(items,topProfitableTrades)
    populateTradesTable(topProfitableTradesWithNames);
}
/*
function populateTradesTable(trades) {
    console.log(Array.from(trades.values()));
    $('#tradesTable').bootstrapTable('refreshOptions', {
        
        data: Array.from(trades.values()), // Pass the array of trades data
        sortable: true
    });
}
*/
function populateTradesTable(trades) {
    $('#tradesTable').bootstrapTable('refreshOptions', {
        data: Array.from(trades.values()), // Pass the array of trades data
        sortable: true,
        columns: [
            { field: 'itemTier', sortable: true, visible: false },
            { field: 'itemName', sortable: true, visible: false },
            { field: 'profit', sortable: true, visible: false },
            {
                field: 'tradeRoute',
                formatter: tradeRouteFormatter, // Format with the custom trade route blocks
                //sorter: tradeRouteSorter,       // Sort with custom sorter
                sortable: true,
                visible: true
            },
            // Hidden columns
            { field: 'sellOrder', visible: false },
            { field: 'sellQuality', visible: false },
            { field: 'sellAge', visible: false },
            { field: 'buyOrder', visible: false },
            { field: 'buyQuality', visible: false },
            { field: 'buyAge', visible: false }
        ]
    });
}
/*
function tradeRouteFormatter(value, row) {
    return `
        <div class="trade-route-container">
            <div class="trade-block">
                <strong>City:</strong> ${row.buyFromCity}<br>
                <strong>Price:</strong> ${row.sellOrder}<br>
                <strong>Quality:</strong> ${row.sellQuality}
                <div class="age-text">Age: ${row.sellAge}</div>
            </div>
            <span class="arrow">→</span>
            <div class="trade-block">
                <strong>City:</strong> ${row.sellToCity}<br>
                <strong>Price:</strong> ${row.buyOrder}<br>
                <strong>Quality:</strong> ${row.buyQuality}
                <div class="age-text">Age: ${row.buyAge}</div>
            </div>
        </div>
    `;
}
*/

function tradeRouteFormatter(value, row, index) {
    return `
        <div class="trade-route">
            <!-- Header with Item Name and Item Tier -->
            <div class="trade-route-header">
                <div class="item-name">${row.itemName}</div>
                <div class="item-tier">Tier: ${row.itemTier}</div>
            </div>

            <!-- Trade Route Content -->
            <div class="trade-route-content">
                <!-- Left Block -->
                <div class="trade-route-block left-block">
                    <div class="block-body">
                        <div class="city-info">
                            <strong>City:</strong> ${row.buyFromCity}
                        </div>
                        <div class="price-info">
                            <strong>Price:</strong> ${row.sellOrder}
                        </div>
                        <div class="quality-info">
                            <strong>Quality:</strong> ${row.sellQuality}
                        </div>
                        <div class="age-info">
                            <small>Age: ${row.sellAge}</small>
                        </div>
                    </div>
                    <div class="age-text">Age: ${row.sellAge}</div>
                </div>

                <!-- Arrow -->
                <div class="trade-route-arrow">
                    &#8594;
                </div>

                <!-- Right Block -->
                <div class="trade-route-block right-block">
                    <div class="block-body">
                        <div class="city-info">
                            <strong>City:</strong> ${row.sellToCity}
                        </div>
                        <div class="price-info">
                            <strong>Price:</strong> ${row.buyOrder}
                        </div>
                        <div class="quality-info">
                            <strong>Quality:</strong> ${row.buyQuality}
                        </div>
                        <div class="age-info">
                            <small>Age: ${row.buyAge}</small>
                        </div>
                    </div>
                    <div class="age-text">Age: ${row.buyAge}</div>
                </div>
            </div>

            <!-- Profit under the blocks -->
            <div class="profit">
                <strong>Profit:</strong> ${row.profit}
            </div>
        </div>
    `;
}




function fillNames (items, trades) {
    const itemLookup = new Map();
    items.forEach(item => {
        itemLookup.set(item.ID, {
            itemName: item.name, 
            itemTier: item.tier,
            itemEnchantment: item.enchantment,
        });
    });

// Iterate over json1 and add itemName from the lookup map
    trades.forEach(item => {
        const itemData = itemLookup.get(item.itemId);
        if (itemData) {
            item.itemName = itemData.itemName;
            item.itemTier = `${itemData.itemTier}.${itemData.itemEnchantment}`;
        }
    });
    return trades; 
}

function splitArrayIntoChunks(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}


function findProfitableTradesBetweenCities(data, cities, taxModifier, marketAge) {
    const profitableTrades = [];
    const now = new Date();

    // Group items by item_id for easier lookup  
    const itemsById = data.reduce((acc, item) => {
        if (!acc[item.item_id]) acc[item.item_id] = [];
        acc[item.item_id].push(item);
        return acc;
    }, {});
  
    // Iterate over each item type
    for (const item_id in itemsById) {
        const items = itemsById[item_id];

        // Compare listings within the defined cities only
        for (let i = 0; i < items.length; i++) {
            const itemA = items[i];

            // Skip if the item is not in one of the desired cities
            if (!cities.includes(itemA.city)) continue;

            // Convert sell price date to Date object and check if it's within market age
            const sellDate = new Date(`${itemA.sell_price_min_date}Z`);
            const sellAge = parseInt((now - sellDate) / 60 / 1000);
            if (sellAge > marketAge) continue;

            for (let j = 0; j < items.length; j++) {
                if (i === j) continue; // Avoid comparing the same city with itself

                const itemB = items[j];
                if (itemB.city != "Black Market") continue;

                // Skip if the item is not in one of the desired cities
                if (!cities.includes(itemB.city)) continue;

                // Convert buy price date to Date object and check if it's within market age
                const buyDate = new Date(`${itemB.buy_price_max_date}Z`);
                const buyAge = parseInt((now - buyDate) / 60 / 1000); 
                if (buyAge > marketAge) continue;

                // Extract relevant values for comparison
                const {
                    sell_price_min: sellPriceA,
                    city: cityA,
                    quality: qualityA
                } = itemA;
                const {
                    buy_price_max: rawBuyPriceB,
                    city: cityB,
                    quality: qualityB
                } = itemB;
                const buyPriceB = parseInt(rawBuyPriceB * taxModifier);
                // Check for profitable trade, ensuring quality constraints are met
                if (buyPriceB > sellPriceA && sellPriceA > 0 && cityA != cityB && qualityA >= qualityB) {
                    profitableTrades.push({
                        buyFromCity: cityA,
                        sellToCity: cityB,
                        itemId: item_id,
                        sellOrder: sellPriceA,
                        buyOrder: buyPriceB,
                        sellQuality: qualityA,
                        buyQuality: qualityB,
                        sellAge: sellAge,
                        buyAge: buyAge,
                        profit: buyPriceB - sellPriceA,
                    });
                }
            }
        }
    }

    return profitableTrades;
}

//main()