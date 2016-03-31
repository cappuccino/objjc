switch (foo)
{
    case "Tom":
        log("Hi Tom!");
        break;

    case "Dick":
    case "Harry":
        {
            log("Bye!");
            break;
        }

    default:
        log("Yo!");
}
