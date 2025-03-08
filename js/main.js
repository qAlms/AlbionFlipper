async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching JSON:', error);
        return null;
    }
}

async function extractItems() {
    let items = [];
    let apiData = await fetchData('https://vekeng.github.io/AlbionFlipper/json/items.json');
    if (!apiData) return [];

    apiData.forEach(item => {
        const itemID = item.UniqueName;
        const [, itemEnchantment] = itemID.includes('@') ? itemID.split('@') : [itemID, 0];
        const match = itemID.match(/^T(\d)/);
        const itemTier = match ? parseInt(match[1]) : 0;

        const itemName = item.LocalizedNames?.['EN-US'] || "N/A";
        const itemDescriptionEng = item.LocalizedDescriptions?.['EN-US'] || 'non-trad';

        if (itemTier >= 4 && !itemDescriptionEng.includes("non-trad")) {
            items.push({ ID: itemID, name: itemName, enchantment: itemEnchantment, tier: itemTier });
        }
    });

    return items;
}

async function getMarketData(region, cities, items) {
    const servers = {
        europe: 'https://europe.albion-online-data.com',
        asia: "https://east.albion-online-data.com",
        americas: "https://west.albion-online-data.com"
    };

    const server = servers[region] || servers.europe;
    const url = `${server}/api/v2/stats/Prices/${items.join(',')}.json?locations=${cities.join(',')}&qualities=0,1,2,3,4`;
    
    return await fetchData(url);
}

async function main(server, tiers, cities, marketAge, premium) {
    console.log("Starting main function", server, tiers, cities, marketAge, premium);

    const taxModifier = premium ? 0.96 : 0.92;
    const items = await extractItems();
    if (!items.length) {
        console.error("No items found.");
        return;
    }

    const selectedItems = items.filter(item => tiers.includes(item.tier)).map(item => item.ID);
    const chunkSize = 250;
    const itemChunks = splitArrayIntoChunks(selectedItems, chunkSize);

    let allItems = [];
    let completedChunks = 0;
    const totalChunks = itemChunks.length;

    for (const chunk of itemChunks) {
        const data = await getMarketData(server, cities, chunk);
        if (data) allItems.push(...data);

        completedChunks++;
        const progress = (completedChunks / totalChunks) * 100;
        document.getElementById("progressBar").style.width = `${progress}%`;
        document.getElementById("progressBar").setAttribute('aria-valuenow', progress);
    }

    const profitableTrades = findProfitableTradesBetweenCities(allItems, cities, taxModifier, marketAge);
    const tradesWithNames = fillNames(items, profitableTrades);
    populateTradesTable(tradesWithNames);
}

function findProfitableTradesBetweenCities(data, cities, taxModifier, marketAge) {
    const profitableTrades = [];
    const now = new Date();

    const itemsById = data.reduce((acc, item) => {
        if (!acc[item.item_id]) acc[item.item_id] = [];
        acc[item.item_id].push(item);
        return acc;
    }, {});

    for (const item_id in itemsById) {
        const items = itemsById[item_id];

        for (let i = 0; i < items.length; i++) {
            const itemA = items[i];

            if (!cities.includes(itemA.city)) continue;
            const sellDate = new Date(`${itemA.sell_price_min_date}Z`);
            if ((now - sellDate) / 60000 > marketAge) continue;

            for (let j = 0; j < items.length; j++) {
                if (i === j) continue;
                const itemB = items[j];

                if (!cities.includes(itemB.city) || itemA.city === itemB.city) continue;
                const buyDate = new Date(`${itemB.buy_price_max_date}Z`);
                if ((now - buyDate) / 60000 > marketAge) continue;

                const sellPriceA = itemA.sell_price_min;
                const buyPriceB = parseInt(itemB.buy_price_max * taxModifier);

                if (buyPriceB > sellPriceA && sellPriceA > 0) {
                    profitableTrades.push({
                        buyFromCity: itemA.city,
                        sellToCity: itemB.city,
                        itemId: item_id,
                        sellOrder: sellPriceA,
                        buyOrder: itemB.buy_price_max,
                        sellQuality: mapQuality(itemA.quality),
                        buyQuality: mapQuality(itemB.quality),
                        sellAge: Math.round((now - sellDate) / 60000),
                        buyAge: Math.round((now - buyDate) / 60000),
                        profit: buyPriceB - sellPriceA,
                        risk: itemB.buy_price_max / itemB.sell_price_min || "N/A"
                    });
                }
            }
        }
    }

    return profitableTrades;
}

function populateTradesTable(trades) {
    $('#tradesTable').bootstrapTable('refreshOptions', {
        data: trades,
        sortable: true,
        sortOrder: 'desc',
        sortName: 'profit',
        columns: [
            { field: 'item', visible: true, formatter: formatItems },
            { field: 'profit', sortable: true, visible: true },
            { field: 'risk', sortable: false, visible: true, formatter: buySellDiff },
            { field: 'tradeRoute', sortable: true, visible: true, formatter: tradeRouteFormatter }
        ]
    });
}

function buySellDiff(value, row) {
    if (row.risk > 0.90) {
        return `<div title="Order may get fulfilled soon!">${row.risk} ⚠️</div>`;
    } else if (row.risk === "N/A") {
        return `<div title="Data is missing to calculate risk">${row.risk}</div>`;
    }
    return row.risk;
}

function formatItems(value, row) {
    return `
    <img src="https://render.albiononline.com/v1/item/${row.itemId}.png" alt="Item Image" width="50" height="50">
    ${row.itemName} (Tier ${row.itemTier})
    `;
}

function tradeRouteFormatter(value, row) {
    return `
        <div class="trade-route-container">
            <div class="trade-block">
                <strong>City:</strong> ${row.buyFromCity}<br>
                <strong>Price:</strong> ${row.sellOrder}<br>
                <strong>Quality:</strong> ${row.sellQuality}
                <div class="age-text">Age: ${row.sellAge} min</div>
            </div>
            <span class="arrow">→</span>
            <div class="trade-block">
                <strong>City:</strong> ${row.sellToCity}<br>
                <strong>Price:</strong> ${row.buyOrder}<br>
                <strong>Quality:</strong> ${row.buyQuality}
                <div class="age-text">Age: ${row.buyAge} min</div>
            </div>
        </div>
    `;
}

function fillNames(items, trades) {
    const itemLookup = new Map(items.map(item => [item.ID, item]));
    trades.forEach(item => {
        const itemData = itemLookup.get(item.itemId);
        if (itemData) {
            item.itemName = itemData.name;
            item.itemTier = `${itemData.tier}.${itemData.enchantment}`;
        }
    });
    return trades;
}

function splitArrayIntoChunks(array, chunkSize) {
    return Array.from({ length: Math.ceil(array.length / chunkSize) }, (_, i) =>
        array.slice(i * chunkSize, i * chunkSize + chunkSize)
    );
}

window.main = main;
