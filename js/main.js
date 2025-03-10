// Definirea funcției mapQuality
function mapQuality(quality) {
    switch (quality) {
        case 0:
            return 'Normal';
        case 1:
            return 'Good';
        case 2:
            return 'Excellent';
        case 3:
            return 'Masterpiece';
        case 4:
            return 'Artifact';
        default:
            return 'Unknown'; // În cazul în care valoarea calității nu este definită
    }
}

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
                const buyPriceB = itemB.buy_price_max * taxModifier;

                if (buyPriceB > sellPriceA && sellPriceA > 0) {
                    const profit = buyPriceB - sellPriceA;
                    console.log(`Profit: ${profit}, Buy Price: ${buyPriceB}, Sell Price: ${sellPriceA}`);
                    
                    if (profit > 10000) { // Filtrare pentru profituri mai mari de 10.000
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
                            profit: profit,
                            risk: sellPriceA > 0 ? Math.min(1, itemB.buy_price_max / sellPriceA) : "N/A"
                        });
                    }
                }
            }
        }
    }

    return profitableTrades;
}

