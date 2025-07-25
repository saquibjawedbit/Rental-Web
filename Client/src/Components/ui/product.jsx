// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { Button } from './button';
import { toast } from 'sonner';
import { addItemToCartApi } from '../../api/carts.api';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18';
import { useAuth } from '../../Middleware/AuthProvider';

export const ProductCard = ({ index, fadeIn, product, onQuickView }) => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user } = useAuth();

    const addItemToCart = async (e) => {
        try {
            if (user.documentVerified === "declined" || user.documentVerified === "pending") {
                toast.error("You must verify your documents")
            }
            else {
                e.preventDefault();
                e.stopPropagation();
                await addItemToCartApi(product._id, 1, 1);
                toast.success(t("product.added"));
            }
        }
        catch (e) {
            toast.error(t("product.failedtoadd"));
        }
    }

    const goToChat = async (e) => {
        try {
            e.preventDefault();
            e.stopPropagation();
            navigate(`/chat`, {
                state: {
                    product,
                },
            });
        }
        catch (e) {
            toast.error("Failed to go to chat");
        }
    }
    return <motion.div
        key={index}
        variants={fadeIn}
        whileHover={{ y: -5 }}
        className="bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm group cursor-pointer"
        onClick={() => onQuickView()}
    >
        <div className="relative">
            <img
                src={product?.images[0]}
                alt={product?.name}
                width={300}
                height={200}
                className="w-full h-48 object-cover"
            />
            <div className="absolute top-3 left-3 flex flex-wrap gap-1">
                {/* {product.tags.map((tag, tagIndex) => (
                          <Badge key={tagIndex} variant={tag === "New" ? "default" : "secondary"} className="text-xs">
                            {tag}
                          </Badge>
                        ))} */}
            </div>
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onQuickView();
                    }}
                    className="opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition"
                >
                    Quick View
                </Button>
            </div>
        </div>
        <div className="p-4">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">
                    {i18n.language === "en" ? product?.category : product?.category_it}
                </span>
            </div>
            <h3 className="font-medium text-gray-900 mb-1 truncate">
                {product?.name}
            </h3>
            <div className="div flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground mb-3 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); navigate(`/profile/${product?.owner?._id}`) }}>
                    {t("product.by")} {product?.owner?.name}
                </p>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3"
                    onClick={(e) => { e.stopPropagation(); goToChat(e); }}
                >
                    {t("buttons.chat")}
                </Button>
            </div>

            <div className="flex items-center justify-between">
                <p className="font-bold text-primary">
                    €{product?.price}/{t("product.day")}
                </p>

                <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3"
                    onClick={(e) => { e.stopPropagation(); addItemToCart(e); }}
                >
                    {t("buttons.add")}
                </Button>
            </div>
        </div>
    </motion.div>
}