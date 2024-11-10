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
        let itemTier, itemName;
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
        if (itemTier && itemTier >= 4) {
            items.push({ID: itemID, name: itemName, enchantment: itemEnchantment, tier: itemTier});
            //console.log({ID: itemID, name: itemName, enchantment: itemEnchantment, tier: itemTier})
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


async function main() {
    const cities = ['Martlock', 'Fort Sterling', 'Thetford', 'Lymhurst', 'Bridgewatch', 'Caerleon', 'Black Market'];
    const taxModifier = 0.96; // Non-prem 0.92
    //const cities = ['Caerleon', 'Black Market'];
    const server = 'europe';
    const marketAge = 30;
    const items = await extractItems();
    const selectedItems = items
        .filter(item => item.tier === 8)
        .map(item => item.ID);
    const chunkSize = 300; 
    const itemChunks = splitArrayIntoChunks(selectedItems, chunkSize);
    const allItems = [];
    for (const chunk of itemChunks) {
        const data = await getMarketData(server,cities,chunk);
        if (data) {
            //console.log("data: ", data.length);
            allItems.push(...data);  // Merge the fetched data
        }
    }
    //console.log("AllData: ", allItems.length);
    const profitableTrades = findProfitableTradesBetweenCities(allItems, cities, taxModifier, marketAge);
    console.log(profitableTrades.length);
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
    /*
    topProfitableTradesWithNames.forEach((trade, item_id) => {
        console.log(`Buy ${trade.itemName} ${trade.itemTier} of quality ${trade.sellQuality} in ${trade.buyFromCity} for ${trade.sellOrder} to sell to quality ${trade.buyQuality} in ${trade.sellToCity} for ${trade.buyOrder} with profit of ${trade.profit}`);
        populateTradesTable(trades);
    });
    */
    populateTradesTable(topProfitableTradesWithNames);
}

function populateTradesTable(trades) {
    const tableBody = document.getElementById('tradesTable').querySelector('tbody');

    // Clear any existing rows
    tableBody.innerHTML = '';

    // Loop through each trade and create a new row
    trades.forEach(trade => {
        const row = document.createElement('tr');

        // Create and insert cells based on the specified fields
        row.innerHTML = `
            <td>${trade.itemTier}</td>
            <td>${trade.itemName}</td>
            <td>${trade.profit}</td>
            <td>${trade.sellOrder}</td>
            <td>${trade.sellQuality}</td>
            <td>${trade.buyFromCity}</td>
            <td>${trade.buyOrder}</td>
            <td>${trade.buyQuality}</td>
            <td>${trade.sellToCity}</td>
        `;

        // Append the row to the table body
        tableBody.appendChild(row);
    });
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
            //item.itemTier = `${tier}.${enchantment}`;
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

    // Define the 20-minute threshold in milliseconds
    const threshold = marketAge * 60 * 1000;

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
            if ((now - sellDate) > threshold) continue;

            for (let j = 0; j < items.length; j++) {
                if (i === j) continue; // Avoid comparing the same city with itself

                const itemB = items[j];

                // Skip if the item is not in one of the desired cities
                if (!cities.includes(itemB.city)) continue;

                // Convert buy price date to Date object and check if it's within market age
                const buyDate = new Date(`${itemB.buy_price_max_date}Z`);
                if (now - buyDate > threshold) continue;

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
                //const buyPriceB = rawBuyPriceB;
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
                        sellDate: sellDate,
                        buyDate: buyDate,
                        profit: buyPriceB - sellPriceA,
                    });
                }
            }
        }
    }

    return profitableTrades;
}

main()