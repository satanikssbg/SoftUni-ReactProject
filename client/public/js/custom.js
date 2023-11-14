let scrollDependants = [];
window.onscroll = () => scrollDependants.forEach(fn => {
    if (fn.minWidth && window.innerWidth > fn.minWidth) {
        fn.func();
    } else if (fn.maxWidth && window.innerWidth < fn.maxWidth) {
        fn.func();
    }
});

function searchform() {
    var complete = true;

    var searchkey = $("#search_key").val();
    var reg = /^[а-яА-Яa-zA-Z0-9\s]+$/u;

    if (searchkey == null || searchkey == "") {
        complete = false;
        erroring = "Не сте въвели дума за тъсене";
    } else if (searchkey.length < 3) {
        complete = false;
        erroring = "Въведете минимум 3 символа";
    } else if (reg.test(searchkey) == false) {
        complete = false;
        erroring = "Използвайте само букви или цифри";
    }

    if (complete == false) {
        $("#search_error").css({ "display": "block" });
        $("#search_error").html(erroring);
    } else {
        $("#search_error").css({ "display": "none" });
    }

    return complete;
}

$(function () {
    $('[data-toggle="tooltip"]').tooltip();
});

/*
 function fixBG() {
 
 let leftAd = document.getElementById('backgroundGlobalLeft');
 let leftImg = document.querySelector('#backgroundGlobalLeft img');
 let rightAd = document.getElementById('backgroundGlobalRight');
 let rightImg = document.querySelector('#backgroundGlobalRight img');
 let contentDiv = document.getElementById('content');
 let styles = getComputedStyle(contentDiv);
 let menu = document.getElementById('mainMenu');
 let menuPos = menu.getBoundingClientRect().bottom;
 leftAd.style.background = `url("${leftImg.src}") no-repeat right top`;
 // leftAd.style.width = styles.marginLeft;
 leftAd.style.left = 0;
 leftAd.style.top = menuPos + 'px';
 leftAd.style.display = 'block';
 leftAd.style.backgroundSize = 'cover';
 rightAd.style.right = 0;
 rightAd.style.top = menuPos + 'px';
 rightAd.style.display = 'block';
 rightAd.style.background = `url("${rightImg.src}") no-repeat left top`;
 rightAd.style.backgroundSize = 'cover';
 // rightAd.style.width = styles.marginRight;
 if (parseInt(styles.marginLeft) * 3 < leftImg.width) {
 rightAd.style.display = 'none';
 leftAd.style.display = 'none';
 }
 
 }
 
 
 scrollDependants.push({minWidth: 1425, func: fixBG});
 window.onload = fixBG;
 window.onresize = fixBG;
 */


let scrollUp = document.getElementById('scrollUP');
scrollDependants.push(() => {
    if (document.scrollingElement.scrollTop > 800) {
        scrollUp.style.display = 'block';
    } else {
        scrollUp.style.display = 'none';
    }
});

function readURL(input) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function (e) {
            $('#imagePreview' + input.id).css('background-image', 'url(' + e.target.result + ')');
            $('#imagePreview' + input.id).hide();
            $('#imagePreview' + input.id).fadeIn(650);
        }
        reader.readAsDataURL(input.files[0]);
    }
}

