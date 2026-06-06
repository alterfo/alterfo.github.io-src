---
title: Круг жизни
date: 2020-09-04
---
Мозг довольно ленивый орган, и если его не мотивировать и не стимулировать, он быстро деградирует, как и мышцы. Но если его постоянно кормить задачами, которые ему по зубам, выделяется гормон азарта допамин, что делает процесс более увлекательным.

Задача самоанализа - самая простая и не требует дополнительных телодвижений, к тому же, любой виток в развитии целесообразно начать с анализа текущей ситуации.
Даже зная точно где находится "точка Б", без точки А маршрут не построить.
Мой любимый инструмент для этого - круг жизни. 

Техника простая:
  - выделить сферы жизни - это можно делать от простого к сложному, выписывая всё, чем вы занимаетесь в течение дня и всё, что занимает ваши мысли и потом обобщать и категоризировать, либо, что проще, воспользоваться типичными категориями, которые есть у всех - здоровье, отношения, работа и тд
  - нарисовать круг, разделить его на столько частей сколько сфер получилось
  - заштриховать сектора в соответствии с чувством наполненности или отдалённости от совершенства
  - заметить, что некоторые сектора заштрихованы в равной степени, значит между ними может быть связь, а некоторые заштрихованы больше других, значит им, может быть стоит уделять меньше внимания и заняться теми сферами, в которых чувствуется недостаток
  

 Поскольку я веб-разработчик, без красивой визуализации не могу обойтись :)

<canvas id="circle-of-life" width="360" height="360"></canvas>

Если ваше "Колесо жизни" выглядит примерно так, оно никуда не поедет, желательно перераспределить энергию чтобы запустить "спиральную динамику" развития. 

Рука руку моет, границы между сферами условны, они плавно перетекают друг в друга и дополняют остальные. В моём колесе большие сегменты занимают работа и отношения, в последний год я работал над этими темами очень сильно, но совершенно забросил очень важные аспекты своей жизни и намерен сбалансировать их со временем. Чтобы было вот так:

<canvas id="circle-of-life-good" width="360" height="360" />

<script>
export default {
    mounted() {
        const ctx3 = document.getElementById("circle-of-life").getContext("2d")
        ctx3.imageSmoothingEnabled = true
        ctx3.shadowBlur = 2
        ctx3.shadowOffsetX = 0
        ctx3.shadowOffsetY = 0

        const tick = 20
        const cx = 180
        const cy = 180


        let fulfillment = new Map()
        fulfillment.set('Здоровье', 5)
        fulfillment.set('Работа', 8)
        fulfillment.set('Личное пространство', 5)
        fulfillment.set('Отношения', 7)
        fulfillment.set('Секс', 3)
        fulfillment.set('Репутация', 3)
        fulfillment.set('Отношения с собой', 3)

        const segmentRad = toRadians(360 / fulfillment.size)

        function draw3() {
            for (let i = 0; i < fulfillment.size; i++) {
                ctx3.fillStyle = getRandomColor()
                ctx3.shadowColor = ctx3.fillStyle

                ctx3.beginPath()
                ctx3.moveTo(cx, cy)
                ctx3.arc(cx, cy, tick * [...fulfillment.values()][i], i * segmentRad, (i + 1) * segmentRad)
                ctx3.lineTo(cx, cy)
                ctx3.closePath()
                ctx3.fill()
            }
        }

        // in case you like using degrees
        function toRadians(deg) {
            return deg * Math.PI / 180
        }

        function getRandomColor() {
            const r = Math.round(Math.random() * 255);
            const g = Math.round(Math.random() * 255);
            const b = Math.round(Math.random() * 255);
            return "rgba(" + r + ", " + g + "," + b + ")";
        }
        draw3()


        const ctx2 = document.getElementById("circle-of-life-good").getContext("2d")
        ctx2.imageSmoothingEnabled = true
        ctx2.shadowBlur = 2
        ctx2.shadowOffsetX = 0
        ctx2.shadowOffsetY = 0


        let fulfillment2 = new Map()
        fulfillment2.set('Здоровье', 8)
        fulfillment2.set('Работа', 8)
        fulfillment2.set('Личное пространство', 8)
        fulfillment2.set('Отношения', 8)
        fulfillment2.set('Секс', 8)
        fulfillment2.set('Репутация', 8)
        fulfillment2.set('Отношения с собой', 8)

        let angle = 0
        const segmentRad2 = toRadians(360 / fulfillment2.size)

        function draw2() {
            for (let i = 0; i < fulfillment2.size; i++) {
                ctx2.fillStyle = getRandomColor()
                ctx2.shadowColor = ctx2.fillStyle

                ctx2.beginPath()
                ctx2.moveTo(cx, cy)
                ctx2.arc(cx, cy, tick * [...fulfillment2.values()][i], i * segmentRad2, (i + 1) * segmentRad2)
                ctx2.lineTo(cx, cy)
                ctx2.closePath()
                ctx2.fill()
            }
        }
        draw2()
    }
}
</script>